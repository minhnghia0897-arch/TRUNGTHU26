// ============================================================================
// Kho dùng chung (client, localStorage) — nguồn tồn kho DUY NHẤT cho cả trang
// Tồn kho lẫn luồng Đơn hàng. Đặt đơn → trừ; huỷ/hoàn/trả/xoá → hoàn.
// Bản thật: đây là bảng warehouse_item + giao dịch kho trong Supabase.
// ============================================================================
import { ALL_STOCK, SETS } from "./inventory";

export const STOCK_KEY = "tr_stock_qty";
export const NAME_KEY = "tr_stock_name";

// ---- tên mặt hàng kho (đổi tên vỏ hộp / bánh) ----
export function getNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NAME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
export function saveNames(n: Record<string, string>) {
  try {
    localStorage.setItem(NAME_KEY, JSON.stringify(n));
    window.dispatchEvent(new StorageEvent("storage", { key: NAME_KEY }));
  } catch {
    /* ignore */
  }
}

const baseStock = (): Record<string, number> =>
  Object.fromEntries(ALL_STOCK.map((s) => [s.key, s.qty]));

export function getStock(): Record<string, number> {
  const base = baseStock();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    return raw ? { ...base, ...JSON.parse(raw) } : base;
  } catch {
    return base;
  }
}

export function saveStock(s: Record<string, number>) {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(s));
    // báo cho tab/màn khác (nếu đang mở)
    window.dispatchEvent(new StorageEvent("storage", { key: STOCK_KEY }));
  } catch {
    /* ignore */
  }
}

/** Cộng/trừ tồn theo map tiêu hao. sign = -1 (trừ khi bán) hoặc +1 (hoàn). */
export function applyStock(consume: Record<string, number>, sign: 1 | -1) {
  const s = getStock();
  for (const [k, q] of Object.entries(consume)) s[k] = (s[k] ?? 0) + sign * q;
  saveStock(s);
  return s;
}

// ---- tính tiêu hao (BOM) khi bán ----
/** Bán n Set → 1 vỏ + các bánh theo định mức, nhân n. */
export function setConsume(setKey: string, n: number): Record<string, number> {
  const set = SETS.find((s) => s.key === setKey);
  if (!set || n <= 0) return {};
  const c: Record<string, number> = { [set.voKey]: n };
  for (const ck of set.cakes) c[ck.key] = (c[ck.key] ?? 0) + ck.qty * n;
  return c;
}
/** Bán n bánh lẻ → trừ bánh đó. */
export function cakeConsume(cakeKey: string, n: number): Record<string, number> {
  return n > 0 ? { [cakeKey]: n } : {};
}
/** Hộp tự chọn: 1 vỏ + các vị khách chọn (cho phép trùng vị). qty = số hộp giống nhau. */
export function pickConsume(shellKey: string, picks: Record<string, number>, qty = 1): Record<string, number> {
  if (qty <= 0) return {};
  const c: Record<string, number> = {};
  if (shellKey) c[shellKey] = qty;
  for (const [k, n] of Object.entries(picks)) if (n > 0) c[k] = (c[k] ?? 0) + n * qty;
  return c;
}
export function mergeConsume(...maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return out;
}
