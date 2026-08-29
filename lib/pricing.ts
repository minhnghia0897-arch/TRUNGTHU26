import type { Box, Combo, Flavor, FlavorPreset, Region, Warehouse } from "./types";
import { convertToBuyerCurrency, currencyOf } from "./money";

// ============================================================================
// Logic giá & phí — thuần, dùng chung client (hiển thị) + server (chốt đơn).
// Money = integer đơn vị nhỏ nhất; giá theo vùng NGƯỜI ĐẶT (§5).
// ============================================================================

export const boxBasePrice = (box: Box, buyer: Region) =>
  buyer === "vn" ? box.price_vn : box.price_kr;

export const flavorSurcharge = (f: Flavor, buyer: Region) =>
  buyer === "vn" ? f.premium_surcharge_vn : f.premium_surcharge_kr;

export const flavorRetailPrice = (f: Flavor, buyer: Region) =>
  buyer === "vn" ? f.price_vn : f.price_kr;

/** Giá 1 hộp tự chọn = giá phẳng theo size + Σ phụ thu premium (KHÔNG cộng giá lẻ). */
export function boxPrice(box: Box, flavorIds: string[], flavors: Flavor[], buyer: Region): number {
  const base = boxBasePrice(box, buyer);
  const sur = flavorIds.reduce((sum, id) => {
    const f = flavors.find((x) => x.id === id);
    return sum + (f ? flavorSurcharge(f, buyer) : 0);
  }, 0);
  return base + sur;
}

/** Một lựa chọn bán được của set, giá đã theo tiền tệ người đặt. */
export interface ComboOption {
  name: string;
  contents: string;
  price: number;
}

/**
 * Các lựa chọn bán được của một set — VD Vinh Hiển có "Nhân đặc biệt" 55.000₩
 * và "Nhân cổ truyền cao cấp" 60.000₩: cùng một hộp, khác ruột, khác giá.
 *
 * Lựa chọn không có giá ở vùng đang xem thì bỏ khỏi danh sách, KHÔNG rơi về giá
 * của lựa chọn khác — thà không bán còn hơn bán sai giá.
 */
export function comboOptions(combo: Combo, buyer: Region): ComboOption[] {
  // Set đã bật cho khách tự chọn vị thì các lựa chọn nhân cố định NGỪNG hiệu
  // lực — một cửa duy nhất, để trang bán, form tạo đơn tay và máy chủ chốt giá
  // không mỗi nơi hiểu một kiểu. Dữ liệu `variants` cũ vẫn nằm nguyên trong
  // database, tắt `pick_count` là quay lại như trước.
  if (comboPickCount(combo)) return [];
  return (combo.variants ?? []).flatMap((v) => {
    const price = buyer === "vn" ? v.price_vn : v.price_kr;
    return price == null ? [] : [{ name: v.name, contents: v.contents, price }];
  });
}

// ---- set cho khách TỰ CHỌN vị (§0025) --------------------------------------
/**
 * Set này cho khách tự chọn bao nhiêu bánh? 0 = set bộ vị cố định (nếp cũ).
 *
 * Đòi hỏi `flavor_ids` không rỗng: bật số mà quên chọn danh sách vị thì khách
 * mở ra chỉ thấy ô trống không bấm được gì. Thà lùi về cách bán cũ.
 */
export function comboPickCount(combo: Combo): number {
  const n = Math.trunc(combo.pick_count ?? 0);
  return n > 0 && (combo.flavor_ids?.length ?? 0) > 0 ? n : 0;
}

/** Những vị khách được bốc, đúng THỨ TỰ shop đã xếp trong `flavor_ids`. */
export function comboPickPool(combo: Combo, flavors: Flavor[]): Flavor[] {
  if (!comboPickCount(combo)) return [];
  return combo.flavor_ids
    .map((id) => flavors.find((f) => f.id === id))
    .filter((f): f is Flavor => !!f && f.active && !f.removed);
}

/**
 * Khách bốc đủ và bốc đúng chưa.
 *
 * Cho phép TRÙNG VỊ — khách thích cả 4 bánh cùng một vị là chuyện thường, không
 * việc gì phải cấm. Nên chỉ xét đủ số lượng và mọi vị đều nằm trong danh sách.
 */
export function validateComboPick(
  combo: Combo,
  flavorIds: string[],
  flavors: Flavor[],
): BoxValidation {
  const need = comboPickCount(combo);
  if (!need) return { ok: true };
  const picked = (flavorIds ?? []).filter(Boolean);
  if (picked.length !== need)
    return { ok: false, error: `Set "${combo.name}" cần chọn đúng ${need} vị (đang ${picked.length}).` };
  const pool = comboPickPool(combo, flavors);
  for (const id of picked)
    if (!pool.some((f) => f.id === id))
      return { ok: false, error: `Có vị không nằm trong danh sách của set "${combo.name}".` };
  return { ok: true };
}

/**
 * Bộ vị sẵn của set — chỉ giữ bộ HỢP LỆ: đủ đúng số ngăn và mọi vị còn bán.
 *
 * Shop sửa danh mục (tắt một vị, đổi số ngăn) thì bộ cũ thành sai; hiện nó ra
 * cho khách bấm là bấm xong máy chủ từ chối, khách không hiểu vì sao. Thà giấu.
 */
export function comboPresets(combo: Combo, flavors: Flavor[]): FlavorPreset[] {
  const need = comboPickCount(combo);
  if (!need) return [];
  const pool = comboPickPool(combo, flavors);
  return (combo.flavor_presets ?? []).filter(
    (p) =>
      (p?.flavor_ids?.length ?? 0) === need &&
      p.flavor_ids.every((id) => pool.some((f) => f.id === id)),
  );
}

/** So hai bộ vị theo KIỂU TÚI: cùng số lượng từng vị, không xét thứ tự bấm. */
const sameBag = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const id of a) count.set(id, (count.get(id) ?? 0) + 1);
  for (const id of b) {
    const n = count.get(id);
    if (!n) return false;
    count.set(id, n - 1);
  }
  return true;
};

/**
 * Khách bốc trùng khít bộ nào thì trả tên bộ đó ("SET A"), không thì undefined.
 *
 * So theo KIỂU TÚI chứ không theo thứ tự: bấm SET A rồi bỏ một vị ra thêm lại
 * vẫn là SET A — với bên đóng gói thì hai hộp đó giống hệt nhau.
 */
export function matchComboPreset(
  combo: Combo,
  flavorIds: string[],
  flavors: Flavor[],
): string | undefined {
  return comboPresets(combo, flavors).find((p) => sameBag(p.flavor_ids, flavorIds ?? []))?.name;
}

/**
 * Ruột hộp ghi trên đơn: "SET A (Lava · Matcha…)" hay "Tự chọn: Lava ×2 · Dẻo…".
 *
 * Bên đóng gói cần biết nhét bánh gì; shop cần biết khách bấm bộ sẵn hay tự
 * bốc. Nên ghi CẢ HAI, chứ không chỉ mỗi tên bộ — bộ có thể được sửa về sau,
 * còn tờ đơn thì phải nói đúng cái đã chốt lúc đặt.
 */
export function describeComboPick(combo: Combo, flavorIds: string[], flavors: Flavor[]): string {
  const list = describePickedFlavors(flavorIds ?? [], flavors);
  const preset = matchComboPreset(combo, flavorIds, flavors);
  if (preset) return `${preset}: ${list}`;
  return (combo.flavor_presets?.length ?? 0) > 0 ? `Tự chọn: ${list}` : list;
}

/** Tên gọn của vị cho chỗ hiển thị chật — trống thì lấy tên đầy đủ. */
export const flavorShortName = (f: Flavor): string => f.short_name?.trim() || f.name;

/**
 * Gộp danh sách vị đã bốc thành một dòng chữ: "Lava ×2 · Dẻo".
 *
 * Gộp trùng chứ không liệt kê lặp, vì dòng này đi thẳng vào tóm tắt đơn và tin
 * nhắn xác nhận — đọc "Trà Xanh · Trà Xanh" thì tưởng bị lỗi. Dùng TÊN GỌN
 * (shop đặt ở Dashboard) — "(Lava Trứng Muối Chảy · Dẻo Kem Trứng Muối · …)"
 * dài tới mức che hết phần còn lại của dòng đơn.
 */
export function describePickedFlavors(flavorIds: string[], flavors: Flavor[]): string {
  const count = new Map<string, number>();
  for (const id of flavorIds ?? []) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()]
    .map(([id, n]) => {
      const f = flavors.find((x) => x.id === id);
      const name = f ? flavorShortName(f) : "Vị đã xoá";
      return n > 1 ? `${name} ×${n}` : name;
    })
    .join(" · ");
}

/**
 * Dò một vị theo TÊN.
 *
 * `contents` của mỗi lựa chọn nhân là chuỗi chữ tự do do người nhập gõ
 * ("Trà Xanh Đậu Đỏ Kem Cheese · Thập Cẩm Gà Quay · …"), không có khoá ngoại nào
 * buộc nó khớp bảng vị. Muốn gắn ảnh cho từng vị thì chỉ còn đường dò ngược theo
 * tên, nên phải rộng tay với khoảng trắng thừa và hoa thường.
 *
 * Dò không ra thì trả `undefined` — chỗ gọi hiện ô giữ chỗ và GIỮ NGUYÊN TÊN.
 * Tuyệt đối không giấu dòng đó đi: gõ lệch một chữ mà mất luôn tên vị trong danh
 * sách thì khách đọc thiếu thành phần hộp quà.
 */
const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

export function findFlavorByName(name: string, flavors: Flavor[]): Flavor | undefined {
  const k = normName(name);
  return k ? flavors.find((f) => normName(f.name) === k) : undefined;
}

/**
 * Giá một set (combo). Set có nhiều lựa chọn thì trả giá thấp nhất — con số
 * hiện ngoài thẻ sản phẩm ("từ ..."), còn giá thật chốt theo lựa chọn khách bấm.
 *
 * Set có giá riêng thì đó chính là giá bán — menu bán theo set, cùng quy cách
 * hộp vẫn có thể hai mức giá theo loại nhân. Không có giá riêng thì suy từ hộp
 * như nếp cũ (combo = hộp tự chọn đã điền sẵn).
 *
 * Trả `null` khi không suy được vì hộp đã xoá hoặc ngừng bán. CỐ Ý không lùi về
 * một hộp bất kỳ: chỗ gọi trước đây dùng `?? boxes[0]` nên set trỏ vào hộp đã
 * tắt sẽ hiện giá của hộp khác — sai giá mà không báo gì.
 */
export function comboPrice(
  combo: Combo,
  boxes: Box[],
  flavors: Flavor[],
  buyer: Region,
): number | null {
  const opts = comboOptions(combo, buyer);
  if (opts.length) return Math.min(...opts.map((o) => o.price));
  const own = buyer === "vn" ? combo.price_vn : combo.price_kr;
  if (own != null) return own;
  const box = boxes.find((b) => b.id === combo.box_id);
  if (!box) return null;
  const derived = boxPrice(box, combo.flavor_ids, flavors, buyer);
  // Giá 0 không bao giờ là cố ý — đó là "chưa đặt giá ở vùng này". Thà không
  // bày bán còn hơn để khách bấm mua một hộp quà giá 0.
  return derived > 0 ? derived : null;
}

// ---- validate hộp tự chọn (§8.1) -------------------------------------------
export interface BoxValidation {
  ok: boolean;
  error?: string;
}
export function validateBoxFill(
  box: Box,
  flavorIds: string[],
  flavors: Flavor[],
): BoxValidation {
  const filled = flavorIds.filter(Boolean);
  if (filled.length !== box.slots)
    return { ok: false, error: `Cần lấp đủ ${box.slots} ô (đang ${filled.length}).` };
  for (const id of filled) {
    const f = flavors.find((x) => x.id === id);
    if (!f || !f.active) return { ok: false, error: "Có vị không hợp lệ hoặc đã ngừng bán." };
    if (f.weight !== box.allowed_flavor_weight)
      return { ok: false, error: `Vị "${f.name}" không đúng loại ${box.allowed_flavor_weight}g của hộp.` };
  }
  return { ok: true };
}

// ---- danh sách món BÁN ĐƯỢC, dùng chung cho trang bán và form tạo đơn tay ---
/**
 * Một dòng khách có thể mua: set (tách theo từng lựa chọn nhân) và vị bán lẻ.
 *
 * `consumeKey` dùng đúng quy ước của `parseKey()` (`combo:<id>` / `flavor:<id>`)
 * nên chỗ nào dựng đơn cũng trừ kho được mà không phải tự chế khoá riêng —
 * form tạo đơn tay trước đây tự chế nên khoá không khớp và kho không hề nhúc nhích.
 */
export interface SellItem {
  key: string;
  label: string;
  price: number;
  consumeKey: string;
  comboId?: string;
  variantName?: string;
  flavorId?: string;
}

export function sellableItems(
  combos: Combo[],
  boxes: Box[],
  flavors: Flavor[],
  buyer: Region,
): SellItem[] {
  const out: SellItem[] = [];

  for (const c of combos) {
    if (!c.active || c.removed) continue;
    const opts = comboOptions(c, buyer);
    if (opts.length) {
      for (const o of opts)
        out.push({
          key: `${c.id}::${o.name}`,
          label: `${c.name} · ${o.name}`,
          price: o.price,
          consumeKey: `combo:${c.id}`,
          comboId: c.id,
          variantName: o.name,
        });
    } else {
      const p = comboPrice(c, boxes, flavors, buyer);
      if (p !== null)
        out.push({ key: c.id, label: c.name, price: p, consumeKey: `combo:${c.id}`, comboId: c.id });
    }
  }

  // Vị bán lẻ — chỉ tính vị có giá. Vị giá 0 là thành phần của set, không bán rời.
  for (const f of flavors) {
    if (!f.active || f.removed) continue;
    const p = buyer === "vn" ? f.price_vn : f.price_kr;
    if (!p) continue;
    out.push({
      key: `flavor-${f.id}`,
      label: `${f.name} (lẻ)`,
      price: p,
      consumeKey: `flavor:${f.id}`,
      flavorId: f.id,
    });
  }

  return out;
}

// ---- phí ship + handling theo kho, quy về tiền tệ người đặt (§6) -----------
export interface ShipFee {
  shipping: number;
  handling: number;
}
/** Những gì một KIỆN mang theo, đủ để tính phí ship của kiện đó. */
export interface ParcelFacts {
  /** Số phần trong kiện — cơ sở xét ngưỡng miễn ship theo số lượng. */
  qty?: number;
  /** Tiền HÀNG của kiện, tiền tệ người đặt, chưa gồm ship/phí xử lý. */
  amount?: number;
  /**
   * Kiện có món nào thu phí ship riêng không (§0022).
   *
   * Mặc định `true` để chỗ gọi thiếu thông tin vẫn thu phí như trước — quên
   * truyền mà hoá ra miễn ship cho cả đơn là kiểu mất tiền không ai thấy.
   */
  chargeShip?: boolean;
}

/**
 * Phí ship + xử lý của MỘT KIỆN, quy về tiền tệ người đặt (§6).
 *
 * Ba cửa ải, qua hết mới thu được phí ship:
 * 1. Kho phải tính ship riêng (`shipping_mode`), không thì giá đã gồm ship.
 * 2. Kiện phải chứa ít nhất một món có `charge_ship` (§0022). Shop miễn ship
 *    gần hết danh mục nên đây mới là cửa lọc chính, không phải cấu hình kho.
 * 3. Kiện chưa chạm ngưỡng miễn phí của kho — theo số phần HOẶC theo tiền hàng,
 *    đạt một trong hai là miễn.
 *
 * Ngưỡng tiền lưu bằng tiền tệ của KHO còn `amount` ở tiền tệ NGƯỜI ĐẶT, nên
 * phải quy ngưỡng sang tiền người đặt rồi mới so. So thẳng số với số là kiểu lỗi
 * im lặng tệ nhất: kho Hàn để ngưỡng 50.000₩, khách VN mua 60.000đ (~3.200₩)
 * cũng lọt qua và mọi đơn VN đều được miễn ship.
 *
 * Phí xử lý (`handling`) đi theo kho chứ không theo món, và không bao giờ được
 * miễn theo ngưỡng — đó là tiền công đóng gói, kiện nào cũng phải đóng.
 */
export function shipFeeForRegion(
  recipientRegion: Region,
  buyer: Region,
  warehouses: Warehouse[],
  fxKrwVnd: number,
  parcel: ParcelFacts = {},
): ShipFee {
  const wh = warehouses.find((w) => w.region === recipientRegion && w.active);
  if (!wh) return { shipping: 0, handling: 0 };
  if (wh.shipping_mode === "included") return { shipping: 0, handling: 0 };

  const { qty = 0, amount = 0, chargeShip = true } = parcel;

  const freeQty = wh.fee_table.free_from_qty ?? 0;
  const freeAmt = wh.fee_table.free_from_amount ?? 0;
  const freeAmtInBuyer = freeAmt
    ? Math.round(convertToBuyerCurrency(freeAmt, wh.local_currency, buyer, fxKrwVnd))
    : 0;
  const overThreshold =
    (freeQty > 0 && qty >= freeQty) || (freeAmtInBuyer > 0 && amount >= freeAmtInBuyer);

  const ship = !chargeShip || overThreshold ? 0 : (wh.fee_table.ship ?? 0);
  const handling = wh.fee_table.handling ?? 0;
  return {
    shipping: Math.round(convertToBuyerCurrency(ship, wh.local_currency, buyer, fxKrwVnd)),
    handling: Math.round(convertToBuyerCurrency(handling, wh.local_currency, buyer, fxKrwVnd)),
  };
}

// ---- tổng hợp bill từ giỏ + người nhận -------------------------------------
export interface CartLine {
  uid: string;
  kind: "box" | "combo" | "la";
  boxId?: string;
  comboId?: string;
  /** Lựa chọn của set khách đã bấm (VD "Nhân cổ truyền cao cấp"). */
  variantName?: string;
  /**
   * Các vị của lựa chọn đã bấm, lấy từ `contents` của variant.
   *
   * Set bán theo lựa chọn nhân (Vinh Hiển, Kim Ngọc Các) để `flavor_ids` trống
   * vì mỗi lựa chọn một bộ vị khác nhau — không có trường này thì giỏ hàng chỉ
   * hiện một dấu gạch.
   */
  flavorText?: string;
  flavorIds?: string[];
  qty: number;
  unitPrice: number; // đã theo vùng người đặt
  name: string;
  recipientUids: string[]; // gán cho nhiều người nhận
  /** Số lượng riêng cho từng người nhận (uid → qty). Thiếu thì lấy `qty` của dòng. */
  qtyByRecipient?: Record<string, number>;
}

/** Số lượng của 1 món dành cho 1 người nhận (fallback về qty chung của dòng). */
export const qtyForRecipient = (l: CartLine, recipientUid: string): number =>
  Math.max(1, l.qtyByRecipient?.[recipientUid] ?? l.qty);

/** Tổng số phần của 1 dòng = Σ số lượng theo từng người nhận (chưa gán ai → qty chung). */
export const lineTotalQty = (l: CartLine): number =>
  l.recipientUids.length
    ? l.recipientUids.reduce((n, ruid) => n + qtyForRecipient(l, ruid), 0)
    : l.qty;
export interface CartRecipient {
  uid: string;
  region: Region;
}
export interface Bill {
  subtotal: number;
  shipping: number;
  handling: number;
  grand: number;
  currency: string;
}
/** Danh mục đang bán, đủ để tra ngược một dòng giỏ về sản phẩm thật. */
export interface Catalog {
  boxes: Box[];
  combos: Combo[];
  flavors: Flavor[];
}

/**
 * Dòng giỏ này có thu phí ship riêng không (§0022).
 *
 * Tra THẲNG TỪ DANH MỤC chứ không lưu cờ vào dòng giỏ, vì hai lẽ: giỏ nằm trong
 * localStorage nên dòng thêm từ trước khi có tính năng này sẽ không có cờ; và
 * shop bật/tắt phí ship của một món thì giỏ đang mở phải đúng theo ngay.
 *
 * Không tra ra sản phẩm → coi như CÓ thu phí. Món lạ mà mặc định miễn ship là
 * kiểu mất tiền không ai thấy; thu nhầm thì khách kêu, còn máy chủ vẫn chốt lại
 * giá lần cuối nên không có chuyện thu oan vào đơn thật.
 */
export function lineChargesShip(
  l: Pick<CartLine, "kind" | "boxId" | "comboId" | "flavorIds">,
  cat?: Catalog,
): boolean {
  if (!cat) return true;
  const charges = (p?: { charge_ship?: boolean }) => (p ? !!p.charge_ship : true);

  if (l.kind === "combo") return charges(cat.combos.find((c) => c.id === l.comboId));
  if (l.kind === "la") return charges(cat.flavors.find((f) => f.id === l.flavorIds?.[0]));
  // Hộp tự chọn: vỏ hộp thu phí, HOẶC có vị nào bên trong thu phí.
  const box = cat.boxes.find((b) => b.id === l.boxId);
  if (charges(box)) return true;
  return (l.flavorIds ?? []).some((id) =>
    charges(cat.flavors.find((f) => f.id === id)),
  );
}

export function computeBill(
  cart: CartLine[],
  recipients: CartRecipient[],
  buyer: Region,
  warehouses: Warehouse[],
  fxKrwVnd: number,
  catalog?: Catalog,
): Bill {
  // tiền = đơn giá × tổng số phần (mỗi người nhận có số lượng riêng)
  const subtotal = cart.reduce((a, l) => a + l.unitPrice * lineTotalQty(l), 0);
  let shipping = 0;
  let handling = 0;
  for (const r of recipients) {
    // Số phần + tiền hàng trong kiện của người nhận này — hai cơ sở xét ngưỡng
    // miễn phí ship. Tiền hàng KHÔNG gồm ship/phí xử lý (xem `fee_table`).
    const mine = cart.filter((l) => l.recipientUids.includes(r.uid));
    const parcelQty = mine.reduce((n, l) => n + qtyForRecipient(l, r.uid), 0);
    if (!parcelQty) continue;
    const parcelAmount = mine.reduce((s, l) => s + l.unitPrice * qtyForRecipient(l, r.uid), 0);
    const fee = shipFeeForRegion(r.region, buyer, warehouses, fxKrwVnd, {
      qty: parcelQty,
      amount: parcelAmount,
      // Một kiện đi một lần: chỉ cần MỘT món thu phí là kiện đó thu, và thu
      // đúng một lần dù kiện có bao nhiêu món.
      chargeShip: mine.some((l) => lineChargesShip(l, catalog)),
    });
    shipping += fee.shipping;
    handling += fee.handling;
  }
  return {
    subtotal,
    shipping,
    handling,
    grand: subtotal + shipping + handling,
    currency: currencyOf(buyer),
  };
}
