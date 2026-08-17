import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { RELEASED_STATUS, type Status } from "@/lib/ordersMock";
import type { Region } from "@/lib/types";

// ============================================================================
// Đơn mua gần đây để hiện trên TRANG CÔNG KHAI — CHỈ CHẠY Ở SERVER.
//
// Đây là cửa duy nhất mà dữ liệu đơn hàng đi ra trang ai cũng xem được, nên nó
// quyết định khách lạ biết được những gì. Nguyên tắc: CHỈ BA THỨ — tên món, vùng
// giao, thời điểm.
//
// TUYỆT ĐỐI KHÔNG lấy tên khách, số điện thoại, địa chỉ, mã đơn hay số tiền. Tên
// khách thì lộ người mua; mã đơn chạy tuần tự (DK0009) nên hiện ra là người lạ
// đếm được shop bán bao nhiêu đơn. Muốn thêm trường nào vào đây thì phải hỏi
// lại: "người lạ biết cái này thì có sao không?".
// ============================================================================

/** Một lượt mua, đã lọc sạch những gì không được để lộ. */
export interface RecentSale {
  /** Mô tả món, VD "Sắc Đỏ ×2". */
  product: string;
  /** Vùng giao — thô đến mức quốc gia, không phải địa chỉ. */
  region: Region;
  /** Thời điểm đặt, dạng ISO. Chữ "18 phút trước" do trình duyệt tự tính. */
  atIso: string;
}

/** Đơn cũ hơn ngần này thì không lôi ra khoe nữa — khoe đơn tuần trước là phản tác dụng. */
const MAX_AGE_DAYS = 3;

interface Row {
  product_summary: string | null;
  status: string;
  web_order: { created_at: string; buyer_region: string } | null;
}

/**
 * Lấy các lượt mua gần đây, mới nhất trước.
 *
 * Lỗi ở đây KHÔNG được làm sập trang bán hàng — mất mấy dòng khoe thì không sao,
 * mất trang sản phẩm là mất doanh thu. Nên bọc try/catch và trả mảng rỗng.
 */
export async function getRecentSales(limit = 8): Promise<RecentSale[]> {
  if (!isServiceRoleConfigured) return [];

  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("shipment")
      .select("product_summary, status, web_order ( created_at, buyer_region )")
      .eq("voided", false)
      .limit(200);
    if (error) throw new Error(error.message);

    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

    return ((data ?? []) as unknown as Row[])
      // Đơn huỷ/trả/hoàn KHÔNG phải lượt mua. Khoe một đơn khách đã trả lại là
      // nói sai, mà lại còn đúng cái đơn shop không muốn nhắc tới.
      .filter((r) => !RELEASED_STATUS.has(r.status as Status))
      .filter((r) => r.product_summary?.trim() && r.web_order)
      .map((r) => ({
        product: r.product_summary!.trim(),
        region: (r.web_order!.buyer_region === "vn" ? "vn" : "kr") as Region,
        atIso: r.web_order!.created_at,
      }))
      .filter((s) => Date.parse(s.atIso) >= cutoff)
      .sort((a, b) => b.atIso.localeCompare(a.atIso))
      .slice(0, limit);
  } catch (e) {
    console.error("RECENT_SALES_FAILED", e instanceof Error ? e.message : e);
    return [];
  }
}
