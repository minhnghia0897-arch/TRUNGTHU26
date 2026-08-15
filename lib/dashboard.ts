import { getServiceClient, isServiceRoleConfigured } from "./supabase/server";
import { RELEASED_STATUS, type Status } from "./ordersMock";
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
  if (!isServiceRoleConfigured) return SEED;
  const sb = getServiceClient();

  const [ordersRes, boxRes, flavorRes, comboRes] = await Promise.all([
    sb
      .from("web_order")
      .select(
        "code, currency, fx_rate_snapshot, created_at, " +
          "customer:customer_id(name, phone, region), " +
          "shipment(fulfillment_region, carrier, vc_code, status, prepaid, cod, cuoc_vc, voided, " +
          "recipient:recipient_id(name, region, desired_date))",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    sb.from("box").select("name, stock, active").eq("removed", false),
    sb.from("flavor").select("name, stock, active").eq("removed", false),
    sb.from("combo").select("name, stock, active").eq("removed", false),
  ]);

  if (ordersRes.error) return SEED;

  type ShipRow = {
    fulfillment_region: string;
    carrier: string | null;
    vc_code: string | null;
    status: string | null;
    prepaid: number | null;
    cod: number | null;
    cuoc_vc: number | null;
    voided: boolean | null;
    recipient: { name: string; region: string; desired_date: string | null } | null;
  };
  type OrderRowDb = {
    code: string;
    currency: string;
    fx_rate_snapshot: number | null;
    created_at: string;
    customer: { name: string; phone: string; region: string } | null;
    shipment: ShipRow[] | null;
  };

  const orders = (ordersRes.data ?? []) as unknown as OrderRowDb[];

  // ---- tiền: quy về KRW theo tỷ giá CHỐT LÚC ĐẶT của từng đơn ----------------
  const fxOf = (o: OrderRowDb) => o.fx_rate_snapshot || 18.5;
  const toKrw = (v: number, o: OrderRowDb) =>
    o.currency === "krw" ? v : v / fxOf(o);

  // "Đã về" — cùng định nghĩa với trang Thu chi: trả trước luôn tính, COD chỉ
  // tính khi đơn đã đánh dấu "Đã thu tiền". Đơn huỷ/trả/hoàn không tính.
  const live = (sh: ShipRow) =>
    !sh.voided && !RELEASED_STATUS.has((sh.status ?? "") as Status);
  const receivedKrw = (sh: ShipRow, o: OrderRowDb) =>
    toKrw((sh.prepaid ?? 0) + (sh.status === "Đã thu tiền" ? (sh.cod ?? 0) : 0), o);

  let revenueKrw = 0;
  let packages = 0;
  let pkgVn = 0;
  let pkgKr = 0;
  let shipping = 0;
  const liveOrderCodes = new Set<string>();

  for (const o of orders) {
    for (const sh of o.shipment ?? []) {
      if (!live(sh)) continue;
      packages += 1;
      liveOrderCodes.add(o.code);
      if (sh.fulfillment_region === "vn") pkgVn += 1;
      else pkgKr += 1;
      if (sh.status === "Đã gửi hàng") shipping += 1;
      revenueKrw += receivedKrw(sh, o);
    }
  }

  // ---- doanh thu 7 ngày gần nhất -------------------------------------------
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const dayKey = (iso: string) => iso.slice(0, 10);
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const k = dayKey(o.created_at);
    if (!k) continue;
    let v = 0;
    for (const sh of o.shipment ?? []) if (live(sh)) v += receivedKrw(sh, o);
    byDay.set(k, (byDay.get(k) ?? 0) + v);
  }
  // 7 ngày liên tiếp tính tới hôm nay, kể cả ngày không có đơn — không thì biểu
  // đồ nhảy cóc và nhìn như doanh thu đều mỗi ngày.
  const today = new Date();
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const k = d.toISOString().slice(0, 10);
    return { d: DOW[d.getDay()], v: Math.round(byDay.get(k) ?? 0) };
  });

  // ---- tồn kho THẬT từ danh mục sản phẩm (§0012) ----------------------------
  const LOW = 10;
  const stockRows = [
    ...((boxRes.data ?? []) as { name: string; stock: number | null; active: boolean }[]),
    ...((comboRes.data ?? []) as { name: string; stock: number | null; active: boolean }[]),
    ...((flavorRes.data ?? []) as { name: string; stock: number | null; active: boolean }[]),
  ].filter((r) => r.active);

  const inventory: DashInventory[] = stockRows
    .map((r) => {
      const qty = r.stock ?? 0;
      return {
        name: r.name,
        qty,
        status: (qty <= 0 ? "out" : qty <= LOW ? "low" : "ok") as DashInventory["status"],
      };
    })
    // hàng cần chú ý lên đầu, rồi mới tới hàng còn nhiều
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 8);

  const lowStock = stockRows.filter((r) => (r.stock ?? 0) <= LOW).length;

  // ---- gom đơn theo khách ---------------------------------------------------
  const customers: DashCustomer[] = orders
    .map((o) => {
      const ships = (o.shipment ?? []).filter(live);
      if (!ships.length) return null;
      return {
        name: o.customer?.name ?? "—",
        phone: o.customer?.phone ?? "",
        region: (o.customer?.region ?? "kr") as Region,
        code: o.code,
        totalKrw: Math.round(ships.reduce((s, sh) => s + receivedKrw(sh, o), 0)),
        shipments: ships.map((sh) => ({
          to: `${sh.recipient?.name ?? "—"}${sh.recipient?.region === "vn" ? " · VN" : " · HQ"}`,
          region: (sh.fulfillment_region ?? "kr") as Region,
          warehouse: sh.fulfillment_region === "vn" ? "Kho VN" : "Kho Hàn",
          carrier: sh.carrier || "—",
          vc: sh.vc_code || "—",
          status: sh.status ?? "Mới",
          pill: pillFor(sh.status ?? ""),
          desired: sh.recipient?.desired_date ?? "",
          cod: Math.round(toKrw(sh.cod ?? 0, o)),
          prepaid: Math.round(toKrw(sh.prepaid ?? 0, o)),
          cuoc: Math.round(toKrw(sh.cuoc_vc ?? 0, o)),
        })),
      };
    })
    .filter((c): c is DashCustomer => c !== null)
    .slice(0, 20);

  return {
    fxKrwVnd: orders[0] ? fxOf(orders[0]) : 18.5,
    kpi: {
      revenueKrw: Math.round(revenueKrw),
      orders: liveOrderCodes.size,
      packages,
      pkgVn,
      pkgKr,
      shipping,
      lowStock,
      // Chưa nối Pancake nên không có gì để đếm. Trước đây hiện 1 lỗi giả.
      pushFailed: 0,
    },
    daily,
    inventory,
    customers,
    source: "supabase",
  };
}

export const seedDashboard = SEED;
