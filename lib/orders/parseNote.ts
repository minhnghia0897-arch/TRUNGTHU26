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
  /** Món khớp được trong danh mục đang bán. */
  itemKey?: string;
  itemLabel?: string;
  qty?: number;
  /** Vị bánh dò được (cho set tự chọn) — chỉ để ghi vào ghi chú đơn. */
  flavors?: string[];
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
  const m = text.match(/(?:\+?84|\+?82|0)[\d .\-]{7,13}\d/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 12) return null;
  const region: Region | undefined =
    digits.startsWith("010") || digits.startsWith("8210") || digits.startsWith("82")
      ? "kr"
      : digits.startsWith("0") || digits.startsWith("84")
        ? "vn"
        : undefined;
  return { phone: m[0].trim(), region };
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

  // 2. Món: so tên từng dòng với danh mục BÁN ĐƯỢC ở vùng này (không dấu,
  // không hoa thường). Ưu tiên tên DÀI khớp trước — "Kim Ngọc Các" phải thắng
  // "Các". Số lượng đọc cạnh chỗ khớp: "x2", "2 hộp", "sl 2".
  const items = sellableItems(cat.combos, cat.boxes, cat.flavors, region);
  const byLen = [...items].sort((a, b) => flat(b.label).length - flat(a.label).length);
  const flatText = flat(text);
  for (const it of byLen) {
    // bỏ đuôi "(lẻ)" và tách "set · lựa chọn" để khớp được cả tên cụt
    const names = [flat(it.label.replace(/\s*\(lẻ\)\s*/, "")), ...it.label.split("·").map(flat)].filter(
      (n) => n.length >= 4,
    );
    const hit = names.find((n) => flatText.includes(n));
    if (!hit) continue;
    out.itemKey = it.key;
    out.itemLabel = it.label;
    const around = flatText.slice(Math.max(0, flatText.indexOf(hit) - 12), flatText.indexOf(hit) + hit.length + 12);
    const q = around.match(/(?:x|×|sl\s*)(\d{1,2})/) ?? around.match(/(\d{1,2})\s*(?:hop|set|phan|cai)/);
    out.qty = q ? Math.max(1, Number(q[1])) : 1;
    rawLines.forEach((l, i) => {
      if (flat(l).includes(hit)) used.add(i);
    });
    break;
  }

  // 3. Vị bánh (cho set tự chọn) — dò MỌI vị xuất hiện, giữ nguyên thứ tự nhắn.
  // Khách hay nhắn tên cụt ("lava trứng muối" thay vì "Lava Trứng Muối Chảy")
  // nên so cả các ĐOẠN ĐẦU của tên vị, từ dài xuống ngắn, tối thiểu 2 chữ và
  // 8 ký tự — ngắn hơn nữa là "trà xanh" của vị này dính sang set kia.
  const seen = new Set<string>();
  for (const f of cat.flavors) {
    const words = flat(f.name).split(" ");
    const prefixes = words.map((_, i) => words.slice(0, words.length - i).join(" "));
    const hit = prefixes.find((n) => n.length >= 8 && n.split(" ").length >= 2 && flatText.includes(n));
    if (hit && !seen.has(f.name)) {
      seen.add(f.name);
      (out.flavors ??= []).push(f.name);
    }
  }

  // 4. Tiền: "cọc/chuyển trước/đặt cọc" → prepaid; "tổng/giá" → total đối chiếu.
  out.prepaid = moneyAfter(text, /(?:dat\s*)?coc|chuyen\s*(?:khoan\s*)?truoc|da\s*(?:chuyen|thanh toan)/) ?? undefined;
  out.total = moneyAfter(text, /tong(?:\s*(?:tien|bill|cong))?|thanh\s*tien|gia(?:\s*tien)?/) ?? undefined;

  // 5. Ngày giao — chỉ đọc khi có chữ dặn giao, kẻo vớ nhầm ngày trong địa chỉ.
  if (/giao|nhan\s*hang|ship\s*ngay|trc\s*ngay|truoc\s*ngay/.test(flatText)) {
    out.date = findDate(text) ?? undefined;
  }

  // 6. Địa chỉ: ưu tiên dòng có nhãn "đc/địa chỉ", rồi tới dòng trông giống
  // địa chỉ nhất (có tên đường/quận/phường… hoặc dài bất thường).
  const labeled = rawLines.findIndex((l) => /^(dc|d\/c|dia chi|add(ress)?)\b/.test(flat(l)));
  const addrIdx =
    labeled >= 0 ? labeled : rawLines.findIndex((l, i) => !used.has(i) && !/\d{9,}/.test(l.replace(/\D/g, "")) && looksLikeAddress(l));
  if (addrIdx >= 0) {
    out.address = rawLines[addrIdx].replace(/^(đc|dc|d\/c|địa chỉ|dia chi|add(?:ress)?)\s*[:\-]?\s*/i, "").trim();
    used.add(addrIdx);
    if (!out.region && /-dong|-gu|seoul|busan|incheon|suwon|ansan/.test(flat(out.address))) out.region = "kr";
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
    nameIdx = rawLines.findIndex(
      (l, i) => !used.has(i) && flat(l).split(" ").length <= 5 && !/\d{4,}/.test(l) && !looksLikeAddress(l),
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
  out.note = [flavorNote, leftover].filter(Boolean).join(" — ") || undefined;

  return out;
}
