import { sellableItems } from "@/lib/pricing";
import type { Box, Combo, Flavor, Region } from "@/lib/types";

// ============================================================================
// Đọc GHI CHÚ TỰ DO của khách thành bản nháp đơn hàng.
//
// Khách nhắn qua Messenger một cục chữ: SĐT, địa chỉ, tên set, vị bánh, tiền
// cọc, ngày giao — trước giờ phải tự đọc rồi gõ lại từng ô vào form tạo đơn.
// Module này đọc hộ: mỗi trường một luật dò riêng, dò ra thì điền sẵn, dò
// không ra thì ĐỂ TRỐNG cho người xác nhận điền nốt.
//
// Cố ý là bộ luật thuần chạy ngay trong trình duyệt chứ không gọi API AI ngoài:
// nhanh tức thì, không tốn phí, và tên + SĐT + địa chỉ khách không rời khỏi
// hệ thống. Đổi lại nó chỉ đọc được ghi chú kiểu người thật nhắn — và thế là
// đủ, vì NGƯỜI vẫn duyệt lại bản nháp trước khi bấm tạo đơn.
//
// LUẬT VÀNG: thà bỏ trống còn hơn đoán bừa. Ô trống thì người điền tiếp;
// ô điền sai mà trông như thật thì thành đơn sai, tiền sai, giao nhầm nhà.
// ============================================================================

export interface ParsedNote {
  phone?: string;
  customer?: string;
  address?: string;
  /** Vùng giao suy từ SĐT/địa chỉ. Không chắc thì thiếu — form giữ mặc định. */
  region?: Region;
  /** Món ĐẦU TIÊN khớp danh mục — giữ cho chỗ gọi chỉ nhận một món (form tạo đơn tay). */
  itemKey?: string;
  itemLabel?: string;
  qty?: number;
  /** TẤT CẢ món khớp được — một tin nhắn đặt mấy set là chuyện thường. */
  items?: { key: string; label: string; qty: number }[];
  /** Đoạn chữ trông như đặt món ("1 set mini") mà danh mục KHÔNG có — hiện ra
   *  cho người xem xử, không bịa thành món khác và càng không thành tên. */
  unknownItems?: string[];
  /** Vị bánh dò được (cho set tự chọn) — chỉ để ghi vào ghi chú đơn. */
  flavors?: string[];
  /** Vị kèm SỐ BÁNH nhắn cạnh nó ("lava x2") — để dựng đúng ruột hộp. */
  flavorPicks?: { id: string; name: string; qty: number }[];
  /** Tiền khách đã cọc / chuyển trước. */
  prepaid?: number;
  /** Tổng tiền khách chốt (chỉ để đối chiếu — giá thật do danh mục quyết). */
  total?: number;
  /** Ngày giao YYYY-MM-DD (khớp ô <input type="date">). */
  date?: string;
  /** Những dòng không đọc ra gì — giữ nguyên làm ghi chú đơn. */
  note?: string;
}

/** Bỏ dấu + thường hoá để so chuỗi kiểu "sac do" ↔ "Sắc Đỏ". */
const flat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ---- tiền ------------------------------------------------------------------
/**
 * "220k" → 220.000 · "1tr2" → 1.200.000 · "63.000₩"/"63,000" → 63000.
 * Chữ số có dấu chấm/phẩy ngăn nghìn thì bỏ dấu; "k"/"tr" nhân theo tiếng lóng
 * chợ mạng. KHÔNG cố đoán đơn vị tiền — vùng của đơn quyết định ₩ hay đ.
 */
function parseMoney(raw: string): number | null {
  const s = raw.toLowerCase().replace(/\s/g, "");
  // "1tr2" = 1.200.000, "1tr78" = 1.780.000: phần sau "tr" là các hàng lùi
  // dần từ trăm nghìn, không phải nhân thẳng 100k mỗi chữ số.
  let m = s.match(/^(\d+)tr(\d{1,3})?$/);
  if (m) {
    const tail = m[2] ? Number(m[2]) * 10 ** (6 - m[2].length) : 0;
    return Number(m[1]) * 1_000_000 + tail;
  }
  m = s.match(/^(\d+(?:[.,]\d+)?)(k|nghin|ngan)$/);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 1000);
  m = s.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)$/);
  if (m) return Number(m[1].replace(/[.,]/g, ""));
  return null;
}

/** Tìm số tiền đứng sau một nhãn ("cọc", "tổng"…) trong cả bài. */
function moneyAfter(text: string, labels: RegExp): number | null {
  // Bọc nhãn trong (?:…): nhãn là một chuỗi CÓ dấu | bên trong, không bọc thì
  // phần bắt số chỉ dính vào vế cuối cùng và các vế trước khớp mà không có số.
  const re = new RegExp(`(?:${labels.source})` + String.raw`\s*:?\s*([\d.,]+\s*(?:k|tr\d*|nghin|ngan)?)`, "i");
  const m = flat(text).match(re);
  return m?.[1] ? parseMoney(m[1].trim()) : null;
}

// ---- SĐT -------------------------------------------------------------------
/**
 * Dò SĐT trong cả bài: chuỗi 9–11 số (cho phép chấm/gạch/cách giữa các cụm).
 * 010… là di động Hàn → vùng kr; 0x… 10 số là VN. Chỉ lấy SỐ ĐẦU TIÊN — ghi chú
 * có hai số (khách + người nhận) thì người duyệt tự phân, đoán bừa là gán nhầm.
 */
function findPhone(text: string): { phone: string; region?: Region } | null {
  // Quét MỌI ứng viên và bỏ qua cụm không đủ số — địa chỉ Hàn đầy cụm số kiểu
  // "04352 305호", vớ phải nó rồi bỏ cuộc là SĐT thật đứng sau không bao giờ
  // được nhìn tới.
  for (const m of text.matchAll(/(?:\+?8[24]|0)[\d .\-]{7,13}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 12) continue;
    const region: Region | undefined =
      digits.startsWith("010") || digits.startsWith("8210") || digits.startsWith("82")
        ? "kr"
        : digits.startsWith("0") || digits.startsWith("84")
          ? "vn"
          : undefined;
    return { phone: m[0].trim(), region };
  }
  return null;
}

// ---- ngày giao -------------------------------------------------------------
/** "giao 25/9", "ngày 25-09-2026" → YYYY-MM-DD. Năm thiếu thì lấy năm nay. */
function findDate(text: string): string | null {
  // Quét MỌI cụm trông giống ngày và lấy cụm HỢP LỆ đầu tiên — SĐT kiểu
  // 010-2345-6789 cũng đẻ ra "10-23" nhưng tháng 23 không tồn tại, bỏ qua nó
  // thì "25/9" thật sự ở sau mới lộ ra.
  for (const m of text.matchAll(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/g)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    let y = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (m[3] && (y < 2020 || y > 2100)) continue;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${y}-${p(mo)}-${p(d)}`;
  }
  return null;
}

// ---- địa chỉ ---------------------------------------------------------------
const ADDR_HINT =
  /so nha|duong|pho |ngo |ngach|quan |huyen|phuong|xa |thon|tp\.?|thanh pho|ha noi|hcm|sai gon|da nang|hai phong|can tho|apt|-dong|-gu|-si|-ro|seoul|busan|incheon|ansan|suwon|dong \d|tang \d|toa|chung cu|khu do thi/;

const looksLikeAddress = (line: string) => ADDR_HINT.test(flat(line)) || flat(line).split(" ").length >= 6;

// ---- ghép tất cả -----------------------------------------------------------
export function parseOrderNote(
  text: string,
  cat: { boxes: Box[]; flavors: Flavor[]; combos: Combo[] },
  regionHint: Region,
): ParsedNote {
  const out: ParsedNote = {};
  const rawLines = text
    .split(/\n|;|·/)
    .map((l) => l.trim())
    .filter(Boolean);
  /** Dòng đã "tiêu" rồi thì không rơi vào ghi chú nữa. */
  const used = new Set<number>();

  // 1. SĐT + vùng — dò trước vì vùng quyết định bảng giá để khớp món.
  const ph = findPhone(text);
  if (ph) {
    out.phone = ph.phone;
    if (ph.region) out.region = ph.region;
  }
  const region = out.region ?? regionHint;

  // 2. Món — bộ luật này phải chịu được MỌI kiểu khách viết (ma trận ca thử
  // nằm trong lịch sử commit): số đứng trước hay sau tên, x2/×2/*2/sl 2, số
  // bằng chữ ("hai hộp"), tên đủ/cụt/không dấu, kèm từ loại (set/hộp/bộ/
  // combo), vị lẻ tên ngắn ("cốm"), nhiều món một dòng tách bằng , + ;.
  const items = sellableItems(cat.combos, cat.boxes, cat.flavors, region);
  const byLen = [...items].sort((a, b) => flat(b.label).length - flat(a.label).length);
  // GIỮ dấu xuống dòng khi ép phẳng: mỗi dòng là một câu riêng của khách. Ép
  // hết thành một dòng thì "…Kim Ngọc Các⏎2 set Sắc Đỏ" đọc ra "các 2 set" —
  // món dòng trên ăn trộm số lượng của món dòng dưới.
  const flatText = text.split("\n").map(flat).join("\n");

  /** Từ chỉ đơn vị bán ("2 hộp", "1 bộ") — dùng cho cả đọc số lượng lẫn nhận
   *  diện cụm-giống-món. */
  const UNIT = "hop|set|bo|combo|phan|cai|goi|banh";
  const NUMWORD: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };

  /** Tìm MỌI chỗ tên món xuất hiện, theo RANH GIỚI TỪ — "com" không được ăn
   *  vào giữa "combo", nhờ vậy vị tên ngắn ("Cốm") mới dám cho khớp. Trả về
   *  tất cả vị trí vì khách có thể nhắc cùng một món ở hai dòng ("1 hộp X giao
   *  Q7… thêm 1 hộp X giao Q1") — chỉ bắt lần đầu là mất nửa đơn. */
  const findWordAll = (needle: string): number[] => {
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, "g");
    const res: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(flatText))) {
      res.push(m.index + m[1].length);
      // Lùi con trỏ về ngay sau tên (bỏ ký tự ranh giới đuôi) để lần khớp sau
      // vẫn dùng được ký tự đó làm ranh giới đầu.
      re.lastIndex = m.index + m[1].length + needle.length;
    }
    return res;
  };

  // Một tin nhắn đặt MẤY món là chuyện thường nên khớp hết chứ không dừng ở
  // món đầu. Mỗi món chiếm một KHOẢNG CHỮ riêng — khoảng đã thuộc món này thì
  // món khác (tên ngắn lồng bên trong) không được nhận nữa.
  const claimed: Array<[number, number]> = [];
  const hits: string[] = [];
  const matched: { key: string; label: string; qty: number; pos: number }[] = [];
  const overlaps = (a: number, b: number) => claimed.some(([x, y]) => a < y && x < b);
  for (const it of byLen) {
    // Các cách gọi món: tên đủ (bỏ đuôi "(lẻ)"), từng vế của "set · lựa chọn",
    // và các ĐOẠN ĐẦU của tên (≥2 từ, ≥8 ký tự) — khách hay gõ cụt "kim ngọc"
    // thay vì "kim ngọc các". Tối thiểu 3 ký tự cho vị lẻ tên ngắn ("cốm").
    const base = [flat(it.label.replace(/\s*\(lẻ\)\s*/, "")), ...it.label.split("·").map(flat)].filter(
      (n) => n.length >= 3,
    );
    // Đoạn đầu rút gọn phải ≥2 từ và ≥8 ký tự — "kim ngọc" được, còn mỗi chữ
    // "kim" thì khớp lung tung. Tên 1 từ chỉ chấp nhận khi đó là TÊN ĐẦY ĐỦ
    // của món (vị lẻ "Cốm") và đã có ranh giới từ giữ an toàn.
    const prefixes = base.flatMap((n) => {
      const w = n.split(" ");
      return w
        .map((_, k) => w.slice(0, w.length - k).join(" "))
        .filter((pfx) => pfx !== n && pfx.split(" ").length >= 2 && pfx.length >= 8);
    });
    const names = [...new Set([...base, ...prefixes])].sort((a, b) => b.length - a.length);
    // Gom MỌI lần món này xuất hiện (tên đủ lẫn tên cụt), không chồng lên nhau
    // và không lấn khoảng đã thuộc món khác.
    const occs: Array<[number, number]> = [];
    for (const n of names) {
      for (const i of findWordAll(n)) {
        const j = i + n.length;
        if (!overlaps(i, j) && !occs.some(([x, y]) => i < y && x < j)) occs.push([i, j]);
      }
    }
    if (!occs.length) continue;
    let total = 0;
    for (const [pos, end] of occs.sort((a, b) => a[0] - b[0])) {
      claimed.push([pos, end]);
      const hit = flatText.slice(pos, end);
      hits.push(hit);
      // Cửa sổ đọc số lượng CHẶN Ở DẤU XUỐNG DÒNG: số đứng đầu dòng dưới là
      // của món dòng dưới, không phải của món này.
      const rawBefore = flatText.slice(Math.max(0, pos - 14), pos);
      const nl = rawBefore.lastIndexOf("\n");
      const before = nl >= 0 ? rawBefore.slice(nl + 1) : rawBefore;
      const after = flatText.slice(end, end + 14).split("\n")[0];
      // Đọc số lượng quanh chỗ khớp, thử lần lượt các kiểu viết. Số phải đứng
      // RỜI (không dính vào số khác): "…7564 set kim ngoc cac" mà không chặn
      // thì đuôi SĐT thành "64 set" — đơn 64 hộp.
      const qm =
        // "tên x2" / "tên sl: 2" — bộ đếm NGAY SAU tên. Ưu tiên phía sau:
        // "sắc đỏ x2 kim ngọc các x1" thì "x2" đứng trước "kim ngọc các"
        // là của sắc đỏ, không được vớ.
        after.match(new RegExp(`^\\s*(?:x|×|\\*|sl\\s*:?\\s*)\\s*(\\d{1,2})(?!\\d)`)) ??
        // "kim ngọc các 2 set" — số + đơn vị NGAY SAU tên
        after.match(new RegExp(`^\\s*(\\d{1,2})\\s*(?:${UNIT})`)) ??
        // "x2 kim ngọc các" — bộ đếm dính NGAY TRƯỚC tên
        before.match(new RegExp(`(?:x|×|\\*|sl\\s*:?\\s*)\\s*(\\d{1,2})\\s*$`)) ??
        // "2 set kim ngọc các" / "02 hộp …" — số (+ đơn vị) NGAY TRƯỚC tên
        before.match(new RegExp(`(?:^|[^\\d])(\\d{1,2})\\s*(?:${UNIT})?\\s*(?:qua\\s*)?$`)) ??
        // "2 hộp⏎Kim Ngọc Các" — số + đơn vị đứng CUỐI DÒNG TRÊN, tên xuống
        // dòng. Bắt buộc có từ đơn vị: số trơ cuối dòng trên (số nhà, tầng…)
        // thì không được tính.
        rawBefore.match(new RegExp(`(?:^|[^\\d])(\\d{1,2})\\s*(?:${UNIT})\\s*\\n\\s*$`)) ??
        // "2 hộp/2 set" đứng đâu đó sát tên, cùng dòng
        (before + " " + after).match(new RegExp(`(?:^|[^\\d])(\\d{1,2})\\s*(?:${UNIT})`));
      let qty = qm ? Number(qm[1]) : 0;
      if (!qty) {
        // số bằng chữ: "hai hộp sắc đỏ", "kim ngọc các lấy ba set"
        const wm = (before + " " + after).match(new RegExp(`(?:^|\\s)(${Object.keys(NUMWORD).join("|")})\\s*(?:${UNIT})`));
        if (wm) qty = NUMWORD[wm[1]];
      }
      total += Math.max(1, qty || 1);
      rawLines.forEach((l, i) => {
        if (flat(l).includes(hit)) used.add(i);
      });
    }
    matched.push({ key: it.key, label: it.label, qty: total, pos: occs[0][0] });
  }
  // Xếp theo thứ tự xuất hiện trong tin nhắn — vòng khớp chạy theo độ dài tên
  // nên không tự có thứ tự này.
  if (matched.length)
    out.items = matched.sort((a, b) => a.pos - b.pos).map(({ key, label, qty }) => ({ key, label, qty }));
  if (out.items?.length) {
    out.itemKey = out.items[0].key;
    out.itemLabel = out.items[0].label;
    out.qty = out.items[0].qty;
  }

  // Dòng TRÔNG NHƯ đặt món (có chữ set/hộp/bánh/combo/mini/lẻ) mà không khớp
  // món nào trong danh mục → giữ riêng để hiện "chưa nhận ra". Không bịa thành
  // món khác, và tuyệt đối không để nó lọt xuống thành TÊN khách ở bước sau.
  // 3. Vị bánh (cho set tự chọn) — dò MỌI vị xuất hiện, giữ nguyên thứ tự nhắn.
  // Khách hay nhắn tên cụt ("lava trứng muối" thay vì "Lava Trứng Muối Chảy")
  // nên so cả các ĐOẠN ĐẦU của tên vị, từ dài xuống ngắn, tối thiểu 2 chữ và
  // 8 ký tự — ngắn hơn nữa là "trà xanh" của vị này dính sang set kia.
  const seen = new Set<string>();
  const flavorHits: string[] = [];
  for (const f of cat.flavors) {
    const words = flat(f.name).split(" ");
    const prefixes = words.map((_, i) => words.slice(0, words.length - i).join(" "));
    const hit = prefixes.find((n) => n.length >= 8 && n.split(" ").length >= 2 && flatText.includes(n));
    if (hit && !seen.has(f.name)) {
      flavorHits.push(hit);
      seen.add(f.name);
      (out.flavors ??= []).push(f.name);
      // số bánh đứng NGAY SAU tên vị ("lava trung muoi x2") — chỉ nhìn sát
      // đuôi, nhìn xa là vớ nhầm số của vị bên cạnh.
      const after = flatText.slice(flatText.indexOf(hit) + hit.length, flatText.indexOf(hit) + hit.length + 8);
      const q = after.match(/^\s*(?:x|×|\*)\s*(\d{1,2})/);
      (out.flavorPicks ??= []).push({ id: f.id, name: f.name, qty: q ? Math.max(1, Number(q[1])) : 1 });
    }
  }

  // Xét theo CỤM (tách bởi , + ; /), và trong mỗi cụm GỌT phần đã hiểu (tên
  // món/vị + số lượng dính kèm) rồi mới xét phần THỪA. Không được bỏ qua cả
  // cụm chỉ vì nó chứa món đã khớp: "set kim ngọc các x2 mini x1" không có
  // dấu phẩy nên cả dòng là một cụm — "mini x1" vẫn phải lòi ra là chưa nhận,
  // biến mất không dấu vết là khách tưởng đã đặt được.
  const PRODUCTISH = new RegExp(`(^|\\s)(\\d+\\s*)?(${UNIT}|mini|le|qua)(\\s|$)|x\\s?\\d`);
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  rawLines.forEach((l, i) => {
    // Gạt dòng SĐT và dòng có dấu hiệu địa chỉ THẬT (tên đường/quận/chữ Hàn).
    // Không dùng luật "≥6 từ là địa chỉ" ở đây — dòng đặt nhiều món cũng dài.
    if (/\d{9,}/.test(l) || ADDR_HINT.test(flat(l)) || /[가-힣]/.test(l)) return;
    for (const seg of l.split(/[,;+/]|\bva\b/)) {
      const fl = flat(seg);
      if (!fl) continue;
      // Gọt mỗi tên đã khớp (món lẫn vị) kèm bộ đếm dính quanh nó: "2 set" /
      // "set" đứng trước, "x2" / "2 hộp" đứng sau. Số đứng trước chỉ gọt khi
      // có từ đơn vị theo sau — số trơ ("x1" của món lạ đứng cạnh) để yên.
      let residue = fl;
      for (const h of [...hits, ...flavorHits])
        residue = residue.replace(
          new RegExp(
            `(?:(?:\\d{1,2}\\s*)?(?:${UNIT})\\s*)?${escRe(h)}(?:\\s*(?:x|×|\\*|sl\\s*:?)\\s*\\d{1,2}|\\s*\\d{1,2}\\s*(?:${UNIT}))?`,
            "g",
          ),
          " ",
        );
      // dọn ký hiệu đếm mồ côi còn sót sau khi gọt ("x" mất số)
      residue = residue.replace(/(^|\s)[x×*](?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
      if (!residue || !PRODUCTISH.test(residue)) continue;
      // phần thừa chỉ toàn từ đơn vị + số ("2 set") mà đứng cạnh món đã khớp —
      // cùng dòng HOẶC dòng kề (khách gõ vội "2 hộp⏎Kim Ngọc Các") — thì là
      // phần số lượng, không phải món lạ; đánh dấu đã tiêu để khỏi rơi vào ghi chú
      const near = [rawLines[i - 1], l, rawLines[i + 1]].filter(Boolean).map((x) => flat(x!));
      if (new RegExp(`^(\\d+|${UNIT}|qua|\\s)+$`).test(residue) && hits.some((h) => near.some((x) => x.includes(h)))) {
        used.add(i);
        continue;
      }
      // Cụm còn nguyên (không gọt được gì) thì giữ nguyên văn có dấu của khách;
      // cụm đã gọt thì chỉ đưa được phần thừa dạng không dấu.
      (out.unknownItems ??= []).push(residue === fl ? seg.trim() : residue);
      used.add(i);
    }
  });


  // 4. Tiền: "cọc/chuyển trước/đặt cọc" → prepaid; "tổng/giá" → total đối chiếu.
  out.prepaid = moneyAfter(text, /(?:dat\s*)?coc|chuyen\s*(?:khoan\s*)?truoc|da\s*(?:chuyen|thanh toan)/) ?? undefined;
  out.total = moneyAfter(text, /tong(?:\s*(?:tien|bill|cong))?|thanh\s*tien|gia(?:\s*tien)?/) ?? undefined;

  // 5. Ngày giao — chỉ đọc khi có chữ dặn giao, kẻo vớ nhầm ngày trong địa chỉ.
  // XOÁ các cụm SĐT khỏi bài trước: "010-1111-2222" đẻ ra "10/11" — ngày giả
  // nhưng hợp lệ, không xoá là nó chen lên trước ngày thật.
  if (/giao|nhan\s*hang|ship\s*ngay|trc\s*ngay|truoc\s*ngay/.test(flatText)) {
    const noPhones = text.replace(/(?:\+?8[24]|0)[\d .\-]{7,13}\d/g, (m) =>
      m.replace(/\D/g, "").length >= 9 ? " " : m,
    );
    out.date = findDate(noPhones) ?? undefined;
  }

  // 6. Địa chỉ: ưu tiên dòng có nhãn "đc/địa chỉ", rồi tới dòng trông giống
  // địa chỉ nhất (có tên đường/quận/phường… hoặc dài bất thường).
  const labeled = rawLines.findIndex((l) => /^(dc|d\/c|dia chi|add(ress)?)\b/.test(flat(l)));
  // Chỉ gạt dòng có CỤM 9+ chữ số LIỀN NHAU (đó là SĐT). Trước đây gộp hết chữ
  // số của dòng lại rồi mới đếm, nên địa chỉ Hàn "대로84길 21-13, 04352 305호"
  // cộng dồn đủ 9 số và bị loại oan.
  // Địa chỉ Hangul nhận thẳng: dòng có chữ Hàn kèm chữ số gần như chắc chắn là
  // địa chỉ (so trên DÒNG GỐC — flat() tách chữ Hàn thành jamo nên so trượt).
  const isAddrLine = (l: string) =>
    !/\d{9,}/.test(l) && (looksLikeAddress(l) || (/[가-힣]/.test(l) && /\d/.test(l)));
  const addrIdx = labeled >= 0 ? labeled : rawLines.findIndex((l, i) => !used.has(i) && isAddrLine(l));
  if (addrIdx >= 0) {
    out.address = rawLines[addrIdx].replace(/^(đc|dc|d\/c|địa chỉ|dia chi|add(?:ress)?)\s*[:\-]?\s*/i, "").trim();
    used.add(addrIdx);
    if (!out.region && (/[가-힣]/.test(out.address) || /-dong|-gu|seoul|busan|incheon|suwon|ansan/.test(flat(out.address))))
      out.region = "kr";
  }

  // 7a. Tên khách hay nằm CHUNG DÒNG với SĐT ("Chị Hoa 010-…", "098… - An"):
  // bóc SĐT ra khỏi dòng đó, phần chữ còn lại ngắn gọn và không dính số thì
  // chính là tên. Dòng này coi như đã tiêu — không rơi vào ghi chú nữa.
  if (out.phone) {
    const idx = rawLines.findIndex((l) => l.includes(out.phone!));
    if (idx >= 0) {
      const rest = rawLines[idx].replace(out.phone, "").replace(/^[\s\-–—·:,]+|[\s\-–—·:,]+$/g, "").trim();
      if (rest && !/\d{3,}/.test(rest) && flat(rest).split(" ").length <= 5 && !looksLikeAddress(rest)) {
        out.customer = rest;
        used.add(idx);
      } else if (!rest) {
        used.add(idx);
      }
    }
  }

  // 7b. Chưa ra thì: dòng có nhãn "tên/khách", không thì dòng NGẮN đầu tiên
  // chưa dùng vào việc gì và không dính số — kiểu "Chị Hoa" đứng đầu tin nhắn.
  const nameLabeled = out.customer
    ? -1
    : rawLines.findIndex((l) => /^(ten|khach|kh|nguoi (dat|nhan))\b/.test(flat(l)));
  let nameIdx = nameLabeled;
  if (nameIdx < 0 && !out.customer)
    // Tên người thì KHÔNG có chữ số và không có từ ngữ hàng hoá — "1 set mini"
    // từng bị nhận nhầm làm tên chỉ vì nó ngắn.
    nameIdx = rawLines.findIndex(
      (l, i) =>
        !used.has(i) &&
        flat(l).split(" ").length <= 5 &&
        !/\d/.test(l) &&
        !/(^|\s)(set|hop|banh|combo|mini|le|qua|vi)(\s|$)/.test(flat(l)) &&
        !looksLikeAddress(l),
    );
  if (nameIdx >= 0) {
    const v = rawLines[nameIdx].replace(/^(tên|ten|khách|khach|kh|người đặt|nguoi dat|người nhận|nguoi nhan)\s*[:\-]?\s*/i, "").trim();
    if (v) {
      out.customer = v;
      used.add(nameIdx);
    }
  }

  // 8. Còn lại → ghi chú, kèm vị đã dò để bên đóng gói nhìn thấy.
  const leftover = rawLines.filter((_, i) => !used.has(i)).join(" · ");
  const flavorNote = out.flavors?.length ? `Vị: ${out.flavors.join(", ")}` : "";
  const unknownNote = out.unknownItems?.length ? `Khách nhắn thêm: ${out.unknownItems.join(" · ")}` : "";
  out.note = [flavorNote, unknownNote, leftover].filter(Boolean).join(" — ") || undefined;

  return out;
}
