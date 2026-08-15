import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import type { Region, Warehouse } from "@/lib/types";

// ============================================================================
// Phí vận chuyển theo kho — sửa từ bảng điều hành.
//
// Phí ship trước đây chỉ nằm trong database, muốn đổi phải vào Supabase gõ SQL.
// Nay sửa được ngay ở trang Sản phẩm, kèm ngưỡng miễn phí ship linh hoạt.
// ============================================================================

export interface ShippingFeePatch {
  /** Phí ship một kiện, tính bằng tiền tệ của kho. */
  ship?: number;
  /** Phí xử lý một kiện. Không được miễn theo ngưỡng. */
  handling?: number;
  /** Mua từ bao nhiêu phần trở lên thì miễn ship. 0 = không miễn. */
  freeFromQty?: number;
}

export async function getWarehousesForAdmin(): Promise<Warehouse[] | null> {
  if (!isServiceRoleConfigured) return null;
  const sb = getServiceClient();
  const { data, error } = await sb.from("warehouse").select("*").order("region");
  if (error) throw new Error(`Không đọc được kho: ${error.message}`);
  return (data ?? []) as Warehouse[];
}

/**
 * Cập nhật phí của một kho.
 *
 * `fee_table` là jsonb nên phải đọc-sửa-ghi cả cụm, không cập nhật lẻ từng
 * khoá được. Chỉ có anh chủ sửa nên không cần khoá tranh chấp.
 */
export async function updateShippingFees(region: Region, patch: ShippingFeePatch) {
  if (!isServiceRoleConfigured) throw new Error("Chưa nối cơ sở dữ liệu.");
  const sb = getServiceClient();

  const { data: cur, error: readErr } = await sb
    .from("warehouse")
    .select("id, fee_table")
    .eq("region", region)
    .single();
  if (readErr || !cur) throw new Error(`Không tìm thấy kho ${region}: ${readErr?.message ?? ""}`);

  const old = (cur as { fee_table: Record<string, number> }).fee_table ?? {};
  const num = (v: number | undefined, fallback: number) =>
    v === undefined || !Number.isFinite(v) ? fallback : Math.max(0, Math.round(v));

  const fee_table = {
    ...old,
    ship: num(patch.ship, old.ship ?? 0),
    handling: num(patch.handling, old.handling ?? 0),
    free_from_qty: num(patch.freeFromQty, old.free_from_qty ?? 0),
  };

  const { error } = await sb
    .from("warehouse")
    .update({ fee_table })
    .eq("id", (cur as { id: string }).id);
  if (error) throw new Error(`Không lưu được phí ship: ${error.message}`);
  return { region, fee_table };
}
