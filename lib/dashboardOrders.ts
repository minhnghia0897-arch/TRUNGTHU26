// ============================================================================
// Cầu nối: đơn đặt từ web (storefront) → hiện trong Dashboard → Đơn hàng.
// Ghi vào cùng localStorage "tr_order_new" mà bảng Đơn hàng đang đọc.
// Bản thật: đơn nằm ở Supabase, dashboard đọc trực tiếp — không cần cầu nối này.
// ============================================================================
import { ORDERS, type OrderRow } from "./ordersMock";

export const DASH_NEW_KEY = "tr_order_new";

/** Thêm một đơn (đã map sang OrderRow) vào kho đơn của dashboard. Trả về đơn kèm id. */
export function addDashboardOrder(row: Omit<OrderRow, "id">): OrderRow {
  let created: OrderRow[] = [];
  try {
    created = JSON.parse(localStorage.getItem(DASH_NEW_KEY) || "[]");
  } catch {
    /* ignore */
  }
  const id = Math.max(1000, ...ORDERS.map((o) => o.id), ...created.map((o) => o.id)) + 1;
  const order: OrderRow = { id, ...row };
  try {
    localStorage.setItem(DASH_NEW_KEY, JSON.stringify([order, ...created]));
  } catch {
    /* ignore */
  }
  return order;
}
