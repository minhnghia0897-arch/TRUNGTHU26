// Types khớp data model §4 (CLAUDE.md). Money = integer đơn vị nhỏ nhất.

export type Region = "vn" | "kr";
export type Currency = "vnd" | "krw";
export type Badge = "best_seller" | "must_try" | null;

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
  badge?: Badge;
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa 4. */
  images?: string[];
  // --- các trường trang quản trị dùng (§0006) ---
  code?: string;
  category?: string;
  cost?: number;
  discount?: number;
  note?: string;
  supply_link?: string;
  variants?: ProductVariant[];
  stock_key?: string;
  allow_negative?: boolean;
  removed?: boolean;
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
  badge?: Badge;
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa 4. */
  images?: string[];
  // --- các trường trang quản trị dùng (§0006) ---
  code?: string;
  category?: string;
  cost?: number;
  discount?: number;
  note?: string;
  supply_link?: string;
  variants?: ProductVariant[];
  stock_key?: string;
  allow_negative?: boolean;
  removed?: boolean;
  active: boolean;
}

/**
 * Một lựa chọn của sản phẩm — VD Vinh Hiển có "Nhân đặc biệt" và "Nhân cổ
 * truyền cao cấp", cùng một hộp nhưng khác ruột và khác giá.
 *
 * Có giá thì lựa chọn đó bán được và giá đó là giá bán. Không giá thì chỉ là
 * mẫu mã mô tả, giá lấy của sản phẩm — giữ nguyên nếp cũ.
 */
export interface ProductVariant {
  name: string;
  contents: string;
  price_vn?: number | null;
  price_kr?: number | null;
}

export interface Combo {
  id: string;
  name: string;
  description?: string;
  box_id: string;
  flavor_ids: string[];
  /**
   * Giá bán của set. Có giá = giá đó là giá bán, hộp chỉ còn là quy cách.
   * Thiếu = suy từ hộp như nếp cũ (combo = hộp tự chọn đã điền sẵn).
   */
  price_vn?: number | null;
  price_kr?: number | null;
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa 4. */
  images?: string[];
  // --- các trường trang quản trị dùng (§0006) ---
  code?: string;
  category?: string;
  cost?: number;
  discount?: number;
  note?: string;
  supply_link?: string;
  variants?: ProductVariant[];
  stock_key?: string;
  allow_negative?: boolean;
  removed?: boolean;
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
