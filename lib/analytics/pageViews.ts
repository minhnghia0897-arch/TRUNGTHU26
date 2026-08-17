import { createHmac } from "node:crypto";
import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";

// ============================================================================
// Đếm khách vào web (§0023) — CHỈ CHẠY Ở SERVER.
//
// Trước đây bảng điều hành không biết gì về lượng truy cập: chỉ thấy đơn đã
// chốt, không thấy bao nhiêu người ghé mà không mua.
//
// ĐẾM ĐƯỢC GÌ VÀ KHÔNG ĐẾM ĐƯỢC GÌ — nói trước để khỏi tin nhầm con số:
// - Đếm được: máy có bật JavaScript (trình duyệt thật của khách).
// - KHÔNG đếm: con bot đi quét web, vì chúng hiếm khi chạy JavaScript. Đây là
//   điều TỐT — số hiện ra là người thật, không phải Googlebot.
// - Một người mở web bằng cả điện thoại lẫn máy tính = đếm hai. Ngược lại, hai
//   người dùng chung wifi và chung loại máy có thể bị gộp làm một. Đây là cái
//   giá của việc không đặt cookie theo dõi khách.
// - Số này KHÔNG chống được gian lận: ai cố tình đổi trình duyệt liên tục thì
//   thổi số lên được. Dùng để xem xu hướng, đừng dùng để tính tiền quảng cáo.
// ============================================================================

/**
 * Múi giờ dùng để cắt "một ngày".
 *
 * Shop bán cả VN lẫn Hàn, hai nơi lệch 2 tiếng, nên phải chọn một mốc và nói rõ
 * — không thì "hôm nay" ở bảng điều hành và "hôm nay" của người xem là hai thứ
 * khác nhau mà chẳng ai để ý. Chọn giờ VN vì anh chủ ngồi VN.
 */
const TZ = "Asia/Ho_Chi_Minh";

/** Ngày dạng YYYY-MM-DD theo giờ VN. `sv-SE` cho ra đúng định dạng ISO. */
export function dayKey(at: Date = new Date()): string {
  return at.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/**
 * Mã ẩn danh của một khách trong MỘT ngày.
 *
 * Khoá HMAC lấy từ service role key — đã là bí mật chỉ máy chủ biết, nên không
 * phải cắm thêm biến môi trường mới (thêm biến là thêm chỗ quên đặt lúc deploy).
 * Bản thân khoá không bao giờ lọt ra ngoài: thứ lưu xuống chỉ là chuỗi băm.
 */
function visitorHash(day: string, ip: string, ua: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "doran-king";
  return createHmac("sha256", key).update(`${day}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/**
 * Ghi nhận một lượt xem trang.
 *
 * Trùng khách trong ngày thì chỉ cộng `hits`, không đẻ dòng mới — nhờ khoá chính
 * (day, visitor). Nên gọi bao nhiêu lần cũng không thổi được số người.
 *
 * KHÔNG BAO GIỜ NÉM LỖI: đây là số liệu phụ, hỏng thì thôi, tuyệt đối không để
 * nó làm trang khách lỗi.
 */
export async function recordVisit(ip: string, ua: string): Promise<void> {
  if (!isServiceRoleConfigured) return;
  const day = dayKey();
  try {
    const sb = getServiceClient();
    await sb.rpc("bump_page_view", { p_day: day, p_visitor: visitorHash(day, ip, ua) });
  } catch {
    /* số liệu phụ — không được làm phiền khách */
  }
}

export interface VisitorStats {
  /** Số người khác nhau vào web hôm nay (giờ VN). */
  today: number;
  /** Hôm qua — để con số hôm nay có cái mà so. */
  yesterday: number;
  /** Tổng số trang đã mở hôm nay. Luôn ≥ `today`. */
  viewsToday: number;
}

/** Đọc số liệu cho bảng điều hành. Lỗi thì trả 0, không làm sập dashboard. */
export async function getVisitorStats(): Promise<VisitorStats> {
  const empty: VisitorStats = { today: 0, yesterday: 0, viewsToday: 0 };
  if (!isServiceRoleConfigured) return empty;

  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));

  try {
    const sb = getServiceClient();
    const [t, y] = await Promise.all([
      sb.from("page_view").select("hits").eq("day", today),
      sb.from("page_view").select("day", { count: "exact", head: true }).eq("day", yesterday),
    ]);
    if (t.error) return empty;
    const rows = (t.data ?? []) as { hits: number | null }[];
    return {
      today: rows.length,
      yesterday: y.count ?? 0,
      viewsToday: rows.reduce((n, r) => n + (r.hits ?? 0), 0),
    };
  } catch {
    return empty;
  }
}
