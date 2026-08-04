import { getPublicClient } from "./supabase/server";
import type { Box, Flavor } from "./types";

// Fallback seed (khớp 0002_seed.sql) khi Supabase chưa cấu hình — để dev chạy được ngay.
const FALLBACK_BOXES: Box[] = [
  { id: "seed-box6", name: "Hộp gấm 6 vị", weight: 150, slots: 6, price_vn: 480000, price_kr: 48000, allowed_flavor_weight: 150, specs: {}, active: true },
  { id: "seed-set", name: "Set Đoàn Viên", weight: 150, slots: 4, price_vn: 390000, price_kr: 39000, allowed_flavor_weight: 150, specs: {}, active: true },
];

const FALLBACK_FLAVORS: Flavor[] = [
  { id: "f1", name: "Thập cẩm gà quay", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 65000, price_kr: 6500, sort: 1, active: true },
  { id: "f2", name: "Sen nhuyễn trứng", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 62000, price_kr: 6200, sort: 2, active: true },
  { id: "f3", name: "Trà xanh", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 60000, price_kr: 6000, sort: 3, active: true },
  { id: "f4", name: "Đậu đỏ", weight: 150, premium: false, premium_surcharge_vn: 0, premium_surcharge_kr: 0, price_vn: 58000, price_kr: 5800, sort: 4, active: true },
  { id: "f5", name: "Vi cá · bào ngư", weight: 150, premium: true, premium_surcharge_vn: 60000, premium_surcharge_kr: 6000, price_vn: 120000, price_kr: 12000, sort: 5, active: true },
  { id: "f6", name: "Yến sào", weight: 150, premium: true, premium_surcharge_vn: 80000, premium_surcharge_kr: 8000, price_vn: 150000, price_kr: 15000, sort: 6, active: true },
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
