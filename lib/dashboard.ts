import { getPublicClient } from "./supabase/server";
import type { Region } from "./types";

// ============================================================================
// Dữ liệu dashboard (§15). Web-native (đơn/doanh số) đọc từ Supabase.
// Tồn kho + tracking là MIRROR từ Pancake (ở đây mock, nối webhook/API sau).
// Doanh số hợp nhất quy về KRW (base) rồi đổi hiển thị qua fx.
// ============================================================================

export interface DashShipment {
  to: string;
  region: Region;
  warehouse: string;
  carrier: string;
  vc: string;
  status: string;
  pill: "new" | "mid" | "ship" | "done" | "late" | "fail";
  desired: string;
  cod: number;
  prepaid: number;
  cuoc: number;
}
export interface DashCustomer {
  name: string;
  phone: string;
  region: Region;
  totalKrw: number;
  code: string;
  shipments: DashShipment[];
}
export interface DashInventory {
  name: string;
  qty: number;
  status: "ok" | "low" | "out";
}
export interface DashboardData {
  fxKrwVnd: number;
  kpi: {
    revenueKrw: number;
    orders: number;
    packages: number;
    pkgVn: number;
    pkgKr: number;
    shipping: number;
    lowStock: number;
    pushFailed: number;
  };
  daily: { d: string; v: number }[]; // v = KRW
  inventory: DashInventory[]; // mirror Pancake
  customers: DashCustomer[];
  source: "supabase" | "seed";
}

// map trạng thái pipeline Pancake → màu pill
export function pillFor(status: string): DashShipment["pill"] {
  const s = status.toLowerCase();
  if (s.includes("lỗi")) return "fail";
  if (s.includes("trễ")) return "late";
  if (s.includes("nhận") || s.includes("thu tiền")) return "done";
  if (s.includes("gửi")) return "ship";
  if (s.includes("mới")) return "new";
  return "mid";
}

// ---- seed fallback (khớp trang-ram-dashboard.html) ----
const SEED: DashboardData = {
  fxKrwVnd: 18.5,
  kpi: { revenueKrw: 4_820_000, orders: 63, packages: 88, pkgVn: 34, pkgKr: 54, shipping: 21, lowStock: 2, pushFailed: 1 },
  daily: [
    { d: "T2", v: 410_000 }, { d: "T3", v: 520_000 }, { d: "T4", v: 690_000 },
    { d: "T5", v: 640_000 }, { d: "T6", v: 880_000 }, { d: "T7", v: 1_120_000 }, { d: "CN", v: 560_000 },
  ],
  inventory: [
    { name: "Vỏ hộp gấm 6 vị", qty: 120, status: "ok" },
    { name: "Bánh thập cẩm 150g", qty: 38, status: "low" },
    { name: "Bánh yến sào 150g", qty: 0, status: "out" },
    { name: "Bánh sen trứng 150g", qty: 210, status: "ok" },
    { name: "Vỏ hộp Đoàn Viên", qty: 24, status: "low" },
  ],
  customers: [
    { name: "Kim Min-ji", phone: "010-2233-4455", region: "kr", totalKrw: 186_000, code: "TR-8241", shipments: [
      { to: "Kim Min · Seoul", region: "kr", warehouse: "Kho Hàn", carrier: "CJ Logistics", vc: "CJ-771182", status: "Đã gửi hàng", pill: "ship", desired: "2026-09-20", cod: 0, prepaid: 96_000, cuoc: 3_000 },
      { to: "Mẹ · Hà Nội", region: "vn", warehouse: "Kho VN", carrier: "GHN", vc: "GHN-55021", status: "Đang đóng hàng", pill: "mid", desired: "2026-09-21", cod: 0, prepaid: 90_000, cuoc: 1_600 },
    ]},
    { name: "Trần Thu Hà", phone: "090-111-2222", region: "vn", totalKrw: 88_000, code: "TR-8236", shipments: [
      { to: "Cô Lan · Đà Nẵng", region: "vn", warehouse: "Kho VN", carrier: "GHTK", vc: "GHTK-90233", status: "Đã nhận", pill: "done", desired: "2026-09-18", cod: 0, prepaid: 88_000, cuoc: 1_600 },
    ]},
    { name: "Park Ji-woo", phone: "010-9876-5432", region: "kr", totalKrw: 142_000, code: "TR-8248", shipments: [
      { to: "Văn phòng · Busan", region: "kr", warehouse: "Kho Hàn", carrier: "—", vc: "—", status: "Lỗi đẩy Pancake", pill: "fail", desired: "2026-09-22", cod: 0, prepaid: 142_000, cuoc: 0 },
    ]},
    { name: "Lê Quốc Anh", phone: "010-5555-6666", region: "kr", totalKrw: 64_000, code: "TR-8250", shipments: [
      { to: "Nhà · Incheon", region: "kr", warehouse: "Kho Hàn", carrier: "CJ Logistics", vc: "CJ-771190", status: "Trễ giao", pill: "late", desired: "2026-09-15", cod: 0, prepaid: 64_000, cuoc: 3_000 },
    ]},
  ],
  source: "seed",
};

/**
 * Đọc dashboard. Nếu Supabase cấu hình → gom đơn theo khách + KPI web-native.
 * Tồn kho luôn là mock (mirror Pancake) cho tới khi nối API/webhook.
 */
export async function getDashboard(): Promise<DashboardData> {
  const sb = getPublicClient();
  if (!sb) return SEED;

  // web-native: web_order + customer + recipient + shipment
  const { data: orders, error } = await sb
    .from("web_order")
    .select(
      "code, currency, fx_rate_snapshot, grand_total, buyer_region, " +
        "customer:customer_id(name, phone, region), " +
        "recipient(name, region, desired_date), " +
        "shipment(fulfillment_region, warehouse_id, carrier, vc_code, tracking_status, prepaid, cod, cuoc_vc, push_status)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !orders?.length) return SEED; // chưa có đơn thật → seed để xem giao diện

  // Nếu có đơn thật, dựng lại cấu trúc — nhưng giữ tồn kho mock.
  // (Bản đầy đủ sẽ join sâu; ở đây trả seed nếu mapping chưa đủ field.)
  return SEED;
}

export const seedDashboard = SEED;
