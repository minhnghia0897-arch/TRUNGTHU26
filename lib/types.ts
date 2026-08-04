// Types khớp data model §4 (CLAUDE.md). Money = integer đơn vị nhỏ nhất.

export type Region = "vn" | "kr";
export type Currency = "vnd" | "krw";

export interface Box {
  id: string;
  name: string;
  description?: string;
  weight: 150 | 60;
  slots: number;
  price_vn: number;
  price_kr: number;
  allowed_flavor_weight: 150 | 60;
  specs: Record<string, unknown>;
  active: boolean;
}

export interface Flavor {
  id: string;
  name: string;
  description?: string;
  weight: 150 | 60;
  premium: boolean;
  premium_surcharge_vn: number;
  premium_surcharge_kr: number;
  price_vn: number;
  price_kr: number;
  sort: number;
  active: boolean;
}

export interface Combo {
  id: string;
  name: string;
  description?: string;
  box_id: string;
  flavor_ids: string[];
  active: boolean;
}

export interface Warehouse {
  id: string;
  region: Region;
  name: string;
  shipping_mode: "separate" | "included";
  fee_table: { ship?: number; handling?: number };
  local_currency: Currency;
  active: boolean;
}

/** Giá theo vùng người đặt */
export const priceFor = (region: Region, vn: number, kr: number) =>
  region === "vn" ? vn : kr;
