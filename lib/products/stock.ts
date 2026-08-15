import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import type { ProductKind } from "./productStore";

// ============================================================================
// Tồn kho — CHỈ MÁY CHỦ ĐƯỢC TRỪ.
//
// Bản cũ đếm kho bằng dữ liệu mẫu hardcode trong lib/inventory.ts và lưu số
// lượng ở localStorage. Nghĩa là mỗi máy một con số, và khách đặt hàng thì trừ
// kho trong trình duyệt của CHÍNH KHÁCH — chủ shop không bao giờ thấy.
//
// Nay tồn nằm cùng bản ghi sản phẩm, cộng trừ qua hàm adjust_stock() ở
// database (§0012) để hai đơn vào cùng lúc không ghi đè nhau.
// ============================================================================

export interface StockMove {
  kind: ProductKind;
  id: string;
  qty: number;
}

/**
 * Trừ kho (`sign = -1`) hoặc hoàn kho (`sign = 1`).
 *
 * Lỗi kho KHÔNG được làm hỏng đơn: đơn đã ghi vào database rồi, ném lỗi ở đây
 * chỉ khiến khách tưởng đặt thất bại và đặt lại lần nữa. Ghi log để đối soát.
 *
 * Trả về số dòng trừ hụt để chỗ gọi ghi nhận nếu cần.
 */
export async function adjustStock(moves: StockMove[], sign: 1 | -1): Promise<number> {
  if (!isServiceRoleConfigured || !moves.length) return 0;
  const sb = getServiceClient();

  // Gộp các dòng cùng một sản phẩm: đơn gửi 3 người nhận cùng một set thì chỉ
  // gọi database một lần thay vì ba.
  const merged = new Map<string, StockMove>();
  for (const m of moves) {
    if (!m.id || !m.qty) continue;
    const k = `${m.kind}:${m.id}`;
    const cur = merged.get(k);
    if (cur) cur.qty += m.qty;
    else merged.set(k, { ...m });
  }

  let failed = 0;
  for (const m of merged.values()) {
    const { error } = await sb.rpc("adjust_stock", {
      p_kind: m.kind,
      p_id: m.id,
      p_delta: sign * m.qty,
    });
    if (error) {
      failed += 1;
      console.error("STOCK_ADJUST_FAILED", m.kind, m.id, sign * m.qty, error.message);
    }
  }
  return failed;
}
