import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import type { Box, Combo, Flavor, ProductVariant } from "@/lib/types";

// ============================================================================
// Sửa danh mục sản phẩm — CHỈ CHẠY Ở SERVER (service role).
//
// Trước đây trang quản trị lưu mọi thay đổi vào localStorage dưới dạng "override"
// đè lên danh mục. Hậu quả nặng: anh sửa giá, đổi tên hay thay ảnh thì KHÁCH
// KHÔNG THẤY GÌ — khách đọc thẳng danh mục, không đọc override; và ảnh base64
// nằm trong trình duyệt của riêng anh. Giờ ghi thẳng vào cột thật, một nguồn.
// ============================================================================

export const isProductStoreConfigured = () => isServiceRoleConfigured;

export type ProductKind = "box" | "flavor" | "combo";

const TABLE: Record<ProductKind, string> = { box: "box", flavor: "flavor", combo: "combo" };

/** `box:<uuid>` → { kind, id }. Trả null nếu khoá không hợp lệ. */
export function parseKey(key: string): { kind: ProductKind; id: string } | null {
  const i = key.indexOf(":");
  if (i < 1) return null;
  const kind = key.slice(0, i) as ProductKind;
  const id = key.slice(i + 1);
  if (!TABLE[kind] || !id) return null;
  return { kind, id };
}

/** Trường trang quản trị gửi lên → cột trong DB. */
export interface ProductPatch {
  name?: string;
  badge?: "best_seller" | "must_try" | null;
  code?: string;
  category?: string;
  images?: string[];
  cost?: number;
  priceVn?: number;
  priceKr?: number;
  discount?: number;
  note?: string;
  supplyLink?: string;
  variants?: ProductVariant[];
  /** Tồn kho của chính sản phẩm (§0012). */
  stock?: number;
  stockKey?: string;
  allowNegative?: boolean;
  active?: boolean;
  removed?: boolean;
  flavorIds?: string[];
  description?: string;
}

const MAX_IMAGES = 4;

function toColumns(kind: ProductKind, p: ProductPatch): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => {
    if (v !== undefined) c[col] = v;
  };

  set("name", p.name);
  set("badge", p.badge);
  set("code", p.code);
  set("category", p.category);
  set("description", p.description);
  set("cost", p.cost);
  set("discount", p.discount);
  set("note", p.note);
  set("supply_link", p.supplyLink);
  set("variants", p.variants);
  set("stock", p.stock);
  set("stock_key", p.stockKey);
  set("allow_negative", p.allowNegative);
  set("active", p.active);
  set("removed", p.removed);
  if (p.images !== undefined) c.images = p.images.slice(0, MAX_IMAGES);

  // Set cố định giờ có giá riêng (§0008): bán theo set nên cùng quy cách hộp
  // vẫn có thể hai mức giá theo loại nhân. Để trống thì suy từ hộp như cũ.
  set("price_vn", p.priceVn);
  set("price_kr", p.priceKr);
  if (kind === "combo" && p.flavorIds !== undefined) c.flavor_ids = p.flavorIds;

  return c;
}

/**
 * Danh mục cho TRANG QUẢN TRỊ — lấy tất cả, kể cả sản phẩm đang tắt bán và
 * sản phẩm trong thùng rác. Khác `lib/catalog.ts` (chỉ lấy hàng đang bán cho
 * khách xem). Chưa cấu hình DB thì trả null để trang lùi về danh mục mẫu.
 */
export async function getAllProducts(): Promise<{
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
} | null> {
  if (!isProductStoreConfigured()) return null;
  const sb = getServiceClient();
  const [b, f, c] = await Promise.all([
    sb.from("box").select("*"),
    sb.from("flavor").select("*").order("sort"),
    sb.from("combo").select("*"),
  ]);
  const err = b.error ?? f.error ?? c.error;
  if (err) throw new Error(`Không đọc được danh mục: ${err.message}`);
  return {
    boxes: (b.data ?? []) as Box[],
    flavors: (f.data ?? []) as Flavor[],
    combos: (c.data ?? []) as Combo[],
  };
}

export async function updateProduct(key: string, patch: ProductPatch) {
  const parsed = parseKey(key);
  if (!parsed) throw new Error(`Khoá sản phẩm không hợp lệ: ${key}`);

  const cols = toColumns(parsed.kind, patch);
  if (!Object.keys(cols).length) return { key };

  const sb = getServiceClient();
  const { error } = await sb.from(TABLE[parsed.kind]).update(cols).eq("id", parsed.id);
  if (error) throw new Error(`Không lưu được sản phẩm: ${error.message}`);
  return { key };
}

/**
 * Tạo sản phẩm mới. Các cột NOT NULL của schema phải có giá trị mặc định hợp lệ,
 * nếu không insert sẽ hỏng — nên điền sẵn ở đây thay vì bắt trang quản trị biết.
 */
export async function createProduct(
  kind: ProductKind,
  patch: ProductPatch,
): Promise<{ key: string }> {
  const sb = getServiceClient();
  const cols = toColumns(kind, patch);

  if (kind === "box") {
    Object.assign(cols, {
      name: patch.name ?? "Hộp mới",
      weight: 150,
      slots: 6,
      allowed_flavor_weight: 150,
      price_vn: patch.priceVn ?? 0,
      price_kr: patch.priceKr ?? 0,
    });
  } else if (kind === "flavor") {
    Object.assign(cols, {
      name: patch.name ?? "Vị mới",
      weight: 150,
      price_vn: patch.priceVn ?? 0,
      price_kr: patch.priceKr ?? 0,
    });
  } else {
    // Set không cần vỏ hộp (§0011): giá, quy cách và vị đều nằm trên chính set.
    // Trước đây bắt buộc có hộp nên không tạo được set khi shop bỏ hộp tự chọn.
    Object.assign(cols, {
      name: patch.name ?? "Bộ quà tặng mới",
      box_id: null,
      flavor_ids: patch.flavorIds ?? [],
    });
  }

  const { data, error } = await sb.from(TABLE[kind]).insert(cols).select("id").single();
  if (error || !data) throw new Error(`Không tạo được sản phẩm: ${error?.message ?? "lỗi không rõ"}`);
  return { key: `${kind}:${(data as { id: string }).id}` };
}

// ------------------------------------------------------------------ ảnh
const BUCKET = "product-images";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** Đẩy một ảnh lên Storage, trả URL công khai. */
export async function uploadProductImage(file: {
  bytes: ArrayBuffer;
  type: string;
  name: string;
}): Promise<string> {
  if (!ALLOWED.has(file.type))
    throw new Error(`Chỉ nhận ảnh JPG, PNG, WEBP, AVIF hoặc GIF (đang gửi: ${file.type || "?"}).`);
  if (file.bytes.byteLength > MAX_BYTES)
    throw new Error(
      `Ảnh nặng ${(file.bytes.byteLength / 1024 / 1024).toFixed(1)}MB, tối đa 5MB. Nén bớt rồi thử lại.`,
    );

  const sb = getServiceClient();
  // tên ngẫu nhiên: tránh lộ tên file gốc và tránh đè ảnh của nhau
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[file.type]}`;

  const { error } = await sb.storage.from(BUCKET).upload(path, file.bytes, {
    contentType: file.type,
    cacheControl: "31536000", // ảnh không đổi nội dung → cho trình duyệt giữ lâu
    upsert: false,
  });
  if (error) throw new Error(`Không tải được ảnh lên: ${error.message}`);

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
