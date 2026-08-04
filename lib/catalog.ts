import { getPublicClient } from "./supabase/server";
import type { Box, Flavor, Combo, Warehouse } from "./types";

// Fallback seed (khớp 0002_seed.sql) khi Supabase chưa cấu hình — để dev chạy được ngay.
const FALLBACK_BOXES: Box[] = [
  { id: "seed-box6", name: "Hộp gấm 6 vị", description: "Vỏ hộp gấm đỏ dập nổi hoa văn gold, 6 ô — anh tự chọn từng vị. Quà biếu sang trọng.", weight: 150, slots: 6, price_vn: 480000, price_kr: 48000, allowed_flavor_weight: 150, specs: { material: "gấm gold", pieces: "6 bánh 150g" }, active: true },
  { id: "seed-set", name: "Set Đoàn Viên", description: "Hộp 4 ô gọn nhẹ, hợp ăn nhà hoặc biếu thân mật.", weight: 150, slots: 4, price_vn: 390000, price_kr: 39000, allowed_flavor_weight: 150, specs: { material: "giấy mỹ thuật", pieces: "4 bánh 150g" }, active: true },
];

const FALLBACK_FLAVORS: Flavor[] = [
  { id: "f1", name: "Thập cẩm gà quay", description: "Nhân thập cẩm truyền thống: mứt bí, hạt sen, lạp xưởng, gà quay, mỡ đường.", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 65000, price_kr: 6500, sort: 1, active: true },
  { id: "f2", name: "Sen nhuyễn trứng", description: "Sen sên tay mịn, 1 trứng muối tan bùi.", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 62000, price_kr: 6200, sort: 2, active: true },
  { id: "f3", name: "Trà xanh", description: "Nhân trà xanh Nhật, ngọt thanh, ít gắt.", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 60000, price_kr: 6000, sort: 3, active: true },
  { id: "f4", name: "Đậu đỏ", description: "Đậu đỏ hầm nhuyễn, ngọt dịu.", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 58000, price_kr: 5800, sort: 4, active: true },
  { id: "f5", name: "Vi cá · bào ngư", description: "Nhân cao cấp vi cá + bào ngư, đậm đà, dành cho quà biếu trọng.", weight: 150, premium: true, premium_surcharge_vn: 60000, premium_surcharge_kr: 6000, price_vn: 120000, price_kr: 12000, sort: 5, active: true },
  { id: "f6", name: "Yến sào", description: "Nhân yến sào thượng hạng, thanh nhẹ, bổ dưỡng.", weight: 150, premium: true, premium_surcharge_vn: 80000, premium_surcharge_kr: 8000, price_vn: 150000, price_kr: 15000, sort: 6, active: true },
];

const FALLBACK_COMBOS: Combo[] = [
  { id: "combo-doanvien", name: "Set Đoàn Viên", description: "4 vị best-seller mix sẵn: thập cẩm, sen trứng, trà xanh, đậu đỏ.", box_id: "seed-set", flavor_ids: ["f1", "f2", "f3", "f4"], active: true },
];

export async function getBoxes(): Promise<Box[]> {
  const sb = getPublicClient();
  if (!sb) return FALLBACK_BOXES;
  const { data, error } = await sb.from("box").select("*").eq("active", true);
  if (error || !data?.length) return FALLBACK_BOXES;
  return data as Box[];
}

export async function getFlavors(): Promise<Flavor[]> {
  const sb = getPublicClient();
  if (!sb) return FALLBACK_FLAVORS;
  const { data, error } = await sb.from("flavor").select("*").eq("active", true).order("sort");
  if (error || !data?.length) return FALLBACK_FLAVORS;
  return data as Flavor[];
}

export async function getCombos(): Promise<Combo[]> {
  const sb = getPublicClient();
  if (!sb) return FALLBACK_COMBOS;
  const { data, error } = await sb.from("combo").select("*").eq("active", true);
  if (error || !data?.length) return FALLBACK_COMBOS;
  return data as Combo[];
}

const FALLBACK_WAREHOUSES: Warehouse[] = [
  { id: "wh-vn", region: "vn", name: "Kho Việt Nam", shipping_mode: "separate", fee_table: { ship: 30000, handling: 0 }, local_currency: "vnd", active: true },
  { id: "wh-kr", region: "kr", name: "Kho Hàn Quốc", shipping_mode: "separate", fee_table: { ship: 3000, handling: 0 }, local_currency: "krw", active: true },
];

export async function getWarehouses(): Promise<Warehouse[]> {
  const sb = getPublicClient();
  if (!sb) return FALLBACK_WAREHOUSES;
  const { data, error } = await sb.from("warehouse").select("*").eq("active", true);
  if (error || !data?.length) return FALLBACK_WAREHOUSES;
  return data as Warehouse[];
}

/** Tỉ giá krw↔vnd (số VND cho 1 KRW). Fallback 18.5 khi chưa cấu hình. */
export async function getFxRate(): Promise<number> {
  const sb = getPublicClient();
  if (!sb) return 18.5;
  const { data } = await sb.from("app_config").select("value").eq("key", "fx_rate").single();
  const v = (data?.value as { krw_vnd?: number } | undefined)?.krw_vnd;
  return typeof v === "number" ? v : 18.5;
}
