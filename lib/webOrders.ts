// ============================================================================
// Lưu đơn web ở trình duyệt (demo) để trang Tra cứu tìm theo SĐT.
// Bản thật: đọc từ Supabase (bảng web_order) + rate-limit tra cứu.
// ============================================================================
import { normalizePhone } from "./phone";
import type { Region } from "./types";

export const WEB_ORDERS_KEY = "tr_web_orders";

export interface WebOrder {
  code: string;
  transferCode: string;
  phone: string; // đã chuẩn hoá E.164
  buyerName: string;
  region: Region;
  currency: string;
  grandTotal: number;
  items: string[]; // mô tả ngắn từng dòng
  status: string; // trạng thái đơn (demo)
  createdAt: number;
}

export function getWebOrders(): WebOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WEB_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWebOrder(o: WebOrder) {
  try {
    const all = getWebOrders();
    localStorage.setItem(WEB_ORDERS_KEY, JSON.stringify([o, ...all]));
  } catch {
    /* ignore */
  }
}

/** Tìm đơn theo SĐT (chuẩn hoá 2 chiều để khớp cả +82/010…). */
export function findOrdersByPhone(raw: string): WebOrder[] {
  const all = getWebOrders();
  const kr = normalizePhone(raw, "kr");
  const vn = normalizePhone(raw, "vn");
  const cands = new Set([raw.trim(), kr, vn].filter(Boolean) as string[]);
  return all.filter((o) => cands.has(o.phone));
}
