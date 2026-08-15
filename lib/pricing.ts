import type { Box, Combo, Flavor, Region, Warehouse } from "./types";
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
  return (combo.variants ?? []).flatMap((v) => {
    const price = buyer === "vn" ? v.price_vn : v.price_kr;
    return price == null ? [] : [{ name: v.name, contents: v.contents, price }];
  });
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

// ---- phí ship + handling theo kho, quy về tiền tệ người đặt (§6) -----------
export interface ShipFee {
  shipping: number;
  handling: number;
}
export function shipFeeForRegion(
  recipientRegion: Region,
  buyer: Region,
  warehouses: Warehouse[],
  fxKrwVnd: number,
): ShipFee {
  const wh = warehouses.find((w) => w.region === recipientRegion && w.active);
  if (!wh) return { shipping: 0, handling: 0 };
  if (wh.shipping_mode === "included") return { shipping: 0, handling: 0 };
  const ship = wh.fee_table.ship ?? 0;
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
export function computeBill(
  cart: CartLine[],
  recipients: CartRecipient[],
  buyer: Region,
  warehouses: Warehouse[],
  fxKrwVnd: number,
): Bill {
  // tiền = đơn giá × tổng số phần (mỗi người nhận có số lượng riêng)
  const subtotal = cart.reduce((a, l) => a + l.unitPrice * lineTotalQty(l), 0);
  let shipping = 0;
  let handling = 0;
  for (const r of recipients) {
    const hasItems = cart.some((l) => l.recipientUids.includes(r.uid));
    if (!hasItems) continue;
    const fee = shipFeeForRegion(r.region, buyer, warehouses, fxKrwVnd);
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
