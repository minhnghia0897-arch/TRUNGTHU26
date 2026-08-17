import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { MAX_PRODUCT_IMAGES, type Box, type Combo, type Flavor, type ProductVariant } from "@/lib/types";

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
  if (p.images !== undefined) c.images = p.images.slice(0, MAX_PRODUCT_IMAGES);

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

// ------------------------------------------------------------ đổi loại
/**
 * Cột có ở CẢ BA bảng — chuyển loại thì mang theo được. Những cột còn lại là của
 * riêng từng loại (hộp có `slots`, set có `flavor_ids`, vị có `premium`…) nên
 * đổi loại là mất, phải nói thẳng cho người dùng chứ không im lặng vứt đi.
 */
const SHARED_COLS = [
  "name", "description", "images", "code", "category", "cost", "discount", "note",
  "supply_link", "variants", "stock_key", "allow_negative", "removed", "badge",
  "stock", "active", "price_vn", "price_kr",
] as const;

/** Cột riêng của từng loại — dùng để báo "đổi sang loại kia thì mất những gì". */
const OWN_COLS: Record<ProductKind, string[]> = {
  box: ["slots", "weight", "allowed_flavor_weight", "specs"],
  combo: ["box_id", "flavor_ids"],
  flavor: ["weight", "premium", "premium_surcharge_vn", "premium_surcharge_kr", "sort"],
};

const KIND_LABEL: Record<ProductKind, string> = { box: "Hộp", combo: "Combo", flavor: "Vị" };

/**
 * Đổi loại một sản phẩm (Hộp ⇄ Combo ⇄ Vị).
 *
 * "Loại" KHÔNG phải một cái nhãn — nó là bảng mà sản phẩm đang nằm trong đó, và
 * khoá sản phẩm (`combo:<uuid>`) dựng từ đó. Nên đổi loại = dời dòng sang bảng
 * khác, và mọi chỗ trỏ tới khoá cũ sẽ trỏ vào hư không.
 *
 * VÌ THẾ CÓ HAI CHỐT CHẶN, và chúng từ chối thẳng thay vì cố sửa:
 *
 *  1. ĐƠN ĐÃ BÁN. `shipment.consume` ghi `{"combo:<id>": 2}` để biết huỷ đơn thì
 *     hoàn lại hàng gì. Dời bảng là khoá đó chết → huỷ đơn không hoàn được kho,
 *     mà lỗi lại im lặng (adjustStock chỉ ghi log). Đúng lớp lỗi tệ nhất: sổ
 *     sách vẫn chạy nhưng số thì sai.
 *  2. SET ĐANG DÙNG. Hộp bị set trỏ vào qua `box_id`, vị bị set trỏ vào qua
 *     `flavor_ids`. Dời đi là set mất ruột, giá tính ra sai.
 *
 * Sản phẩm mới tạo chưa bán lần nào thì đổi thoải mái — đó chính là lúc người ta
 * cần đổi nhất (chọn nhầm loại lúc tạo).
 */
export async function convertProduct(
  key: string,
  toKind: ProductKind,
): Promise<{ key: string; dropped: string[] }> {
  const parsed = parseKey(key);
  if (!parsed) throw new Error(`Khoá sản phẩm không hợp lệ: ${key}`);
  if (!TABLE[toKind]) throw new Error("Loại sản phẩm không hợp lệ.");
  if (parsed.kind === toKind) return { key, dropped: [] };

  const sb = getServiceClient();

  const { data: row, error: rErr } = await sb
    .from(TABLE[parsed.kind])
    .select("*")
    .eq("id", parsed.id)
    .maybeSingle();
  if (rErr) throw new Error(`Không đọc được sản phẩm: ${rErr.message}`);
  if (!row) throw new Error("Sản phẩm không còn tồn tại.");

  // --- chốt 1: đã có đơn nào tiêu hao sản phẩm này chưa ---
  // Đọc rồi lọc ở đây thay vì dùng toán tử jsonb: danh mục shop chỉ vài chục
  // sản phẩm và vài nghìn kiện, đổi lấy một câu truy vấn ai đọc cũng hiểu.
  const { data: ships, error: sErr } = await sb
    .from("shipment")
    .select("consume")
    .not("consume", "is", null)
    .limit(5000);
  if (sErr) throw new Error(`Không kiểm tra được đơn hàng: ${sErr.message}`);
  const used = (ships ?? []).some((s) =>
    Object.keys((s as { consume: Record<string, number> | null }).consume ?? {}).includes(key),
  );
  if (used)
    throw new Error(
      `Sản phẩm này đã nằm trong đơn đã bán nên không đổi loại được — đổi là những đơn đó ` +
        `huỷ không hoàn lại kho được. Hãy tạo sản phẩm mới dạng ${KIND_LABEL[toKind]} rồi ` +
        `tắt bán sản phẩm này.`,
    );

  // --- chốt 2: có set nào đang trỏ vào không ---
  if (parsed.kind === "box" || parsed.kind === "flavor") {
    const { data: combos } = await sb.from("combo").select("name, box_id, flavor_ids");
    const holder = (combos ?? []).find((c) => {
      const x = c as { name: string; box_id: string | null; flavor_ids: string[] | null };
      return parsed.kind === "box"
        ? x.box_id === parsed.id
        : (x.flavor_ids ?? []).includes(parsed.id);
    }) as { name: string } | undefined;
    if (holder)
      throw new Error(
        `Set "${holder.name}" đang dùng sản phẩm này nên không đổi loại được. Gỡ khỏi set đó rồi thử lại.`,
      );
  }

  // --- dựng dòng mới ở bảng đích ---
  const src = row as Record<string, unknown>;
  const cols: Record<string, unknown> = {};
  for (const c of SHARED_COLS) if (src[c] !== undefined && src[c] !== null) cols[c] = src[c];

  // Cột NOT NULL của bảng đích phải có giá trị — cùng bộ mặc định với createProduct.
  if (toKind === "box") {
    Object.assign(cols, {
      weight: src.weight ?? 150,
      slots: src.slots ?? 6,
      allowed_flavor_weight: src.allowed_flavor_weight ?? 150,
      price_vn: src.price_vn ?? 0,
      price_kr: src.price_kr ?? 0,
    });
  } else if (toKind === "flavor") {
    Object.assign(cols, {
      weight: src.weight ?? 150,
      price_vn: src.price_vn ?? 0,
      price_kr: src.price_kr ?? 0,
    });
  } else {
    Object.assign(cols, { box_id: null, flavor_ids: src.flavor_ids ?? [] });
  }

  const { data: made, error: iErr } = await sb
    .from(TABLE[toKind])
    .insert(cols)
    .select("id")
    .single();
  if (iErr || !made) throw new Error(`Không đổi được loại: ${iErr?.message ?? "lỗi không rõ"}`);

  // Xoá dòng cũ SAU KHI dòng mới đã nằm chắc trong database. Ngược lại thì lỗi ở
  // bước chèn là mất luôn sản phẩm.
  const { error: dErr } = await sb.from(TABLE[parsed.kind]).delete().eq("id", parsed.id);
  if (dErr)
    throw new Error(
      `Đã tạo bản ${KIND_LABEL[toKind]} nhưng chưa xoá được bản ${KIND_LABEL[parsed.kind]} cũ ` +
        `(${dErr.message}). Vào danh sách xoá tay bản cũ để khỏi trùng.`,
    );

  // Những cột của loại cũ mà loại mới không có → đã mất, phải báo.
  const kept = new Set<string>(OWN_COLS[toKind]);
  const dropped = OWN_COLS[parsed.kind].filter(
    (c) => !kept.has(c) && src[c] !== undefined && src[c] !== null,
  );

  return { key: `${toKind}:${(made as { id: string }).id}`, dropped };
}

// ------------------------------------------------------------------ ảnh
const BUCKET = "product-images";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
/**
 * PHẢI THẤP HƠN giới hạn thân yêu cầu của Vercel (4.5MB).
 *
 * Trước đây để 5MB — tức là CAO HƠN — nên với ảnh 4.5–5MB thì hạ tầng chặn
 * trước, trả chuỗi chữ "Request Entity Too Large", và câu báo lỗi tử tế bằng
 * tiếng Việt ngay dưới đây không bao giờ chạy tới. Chốt chặn nằm cao hơn chốt
 * chặn thật thì chỉ là trang trí.
 */
const MAX_BYTES = 4 * 1024 * 1024;

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
