import type { Box, Flavor, Region, Warehouse } from "./types";
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
  flavorIds?: string[];
  qty: number;
  unitPrice: number; // đã theo vùng người đặt
  name: string;
  recipientUids: string[]; // gán cho nhiều người nhận → mỗi người 1 phần (qty)
}
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
  // mỗi người nhận được gán = 1 phần (qty) → tiền nhân theo số người nhận
  const subtotal = cart.reduce((a, l) => a + l.unitPrice * l.qty * Math.max(1, l.recipientUids.length), 0);
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
