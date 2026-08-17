// Types khớp data model §4 (CLAUDE.md). Money = integer đơn vị nhỏ nhất.

export type Region = "vn" | "kr";
export type Currency = "vnd" | "krw";
export type Badge = "best_seller" | "must_try" | null;

/**
 * Số ảnh tối đa của một sản phẩm.
 *
 * Trước đây con số này được khai ba lần độc lập (trang bán, trang quản trị,
 * tầng lưu). Lệch một chỗ là ảnh lưu được mà không hiện ra, hoặc ngược lại —
 * nên để đúng một chỗ.
 */
export const MAX_PRODUCT_IMAGES = 6;

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
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa MAX_PRODUCT_IMAGES. */
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
  /** Tồn kho của chính sản phẩm (§0012). Máy chủ trừ lúc tạo đơn. */
  stock?: number;
  /** Có thu phí ship riêng không — xem `Combo.charge_ship`. */
  charge_ship?: boolean;
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
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa MAX_PRODUCT_IMAGES. */
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
  /** Tồn kho của chính sản phẩm (§0012). Máy chủ trừ lúc tạo đơn. */
  stock?: number;
  /** Có thu phí ship riêng không — xem `Combo.charge_ship`. */
  charge_ship?: boolean;
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
  badge?: Badge;
  description?: string;
  /**
   * Vỏ hộp dùng chung quy cách. Để trống với set tự mô tả đủ — giá, quy cách và
   * vị đều nằm trên chính set, vỏ hộp không giữ thêm thông tin gì (§0011).
   */
  box_id: string | null;
  flavor_ids: string[];
  /**
   * Giá bán của set. Có giá = giá đó là giá bán, hộp chỉ còn là quy cách.
   * Thiếu = suy từ hộp như nếp cũ (combo = hộp tự chọn đã điền sẵn).
   */
  price_vn?: number | null;
  price_kr?: number | null;
  /** Ảnh sản phẩm (URL công khai trên Supabase Storage), tối đa MAX_PRODUCT_IMAGES. */
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
  /** Tồn kho của chính sản phẩm (§0012). Máy chủ trừ lúc tạo đơn. */
  stock?: number;
  /**
   * Món này có thu phí ship riêng không (§0022). Thiếu/false = giá đã gồm ship.
   *
   * Phí ship là thuộc tính của SẢN PHẨM, không phải của kho: shop miễn ship gần
   * hết danh mục, chỉ vài món thu riêng. Kiện nào chứa ít nhất một món `true`
   * thì thu phí của kho ĐÚNG MỘT LẦN — một kiện đi một lần, không nhân theo số
   * món. Kiện toàn món `false` thì không thu.
   */
  charge_ship?: boolean;
  removed?: boolean;
  active: boolean;
}

export interface Warehouse {
  id: string;
  region: Region;
  name: string;
  shipping_mode: "separate" | "included";
  /**
   * Phí của kho, tính bằng `local_currency`.
   *
   * Hai ngưỡng miễn phí ship, ĐỘC LẬP nhau — đạt một trong hai là được miễn:
   * - `free_from_qty`: mua từ bao nhiêu PHẦN trở lên.
   * - `free_from_amount`: tiền hàng từ bao nhiêu trở lên, tính bằng
   *   `local_currency` của kho (kho VN gõ đồng, kho Hàn gõ won). Đơn của khách
   *   có thể ở tiền tệ khác nên lúc so phải quy đổi qua fx đã chốt của đơn.
   *
   * Cả hai đều tính THEO TỪNG KIỆN vì phí ship cũng tính theo kiện — gửi 3
   * người là 3 kiện, kiện nào đủ thì kiện đó được miễn. 0 hoặc bỏ trống = không
   * miễn. Phí xử lý (`handling`) vẫn thu như thường.
   *
   * "Tiền hàng" ở đây là tiền HÀNG của kiện, chưa gồm ship và phí xử lý — nếu
   * tính cả phí thì đơn sát ngưỡng sẽ tự nhảy qua ngưỡng nhờ chính khoản phí
   * sắp được miễn, một vòng luẩn quẩn.
   */
  fee_table: {
    ship?: number;
    handling?: number;
    free_from_qty?: number;
    free_from_amount?: number;
  };
  local_currency: Currency;
  active: boolean;
}

/** Giá theo vùng người đặt */
export const priceFor = (region: Region, vn: number, kr: number) =>
  region === "vn" ? vn : kr;
