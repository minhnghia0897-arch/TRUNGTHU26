import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Supabase phía TRÌNH DUYỆT — chỉ dùng cho kênh trực tiếp (đếm người đang xem).
//
// Dùng anon key, đúng thứ vốn đã public. KHÔNG bao giờ đặt service role key ở
// đây: file này gói vào bundle gửi xuống máy khách, ai cũng đọc được.
//
// NẠP ĐỘNG, KHÔNG import thẳng. Nhập tĩnh `createClient` làm bundle trang bán
// hàng phình từ 5kB lên 69kB — 64kB nằm chắn đường mọi khách, chỉ để phục vụ
// một cái chip mà phần lớn thời gian bị ẩn (dưới 3 người xem). Nạp động thì
// thư viện chỉ tải SAU khi trang đã hiện xong, và trang bán hàng nhẹ như cũ.
//
// Không đọc/ghi bảng nào qua client này. Presence của Realtime không đụng tới
// dữ liệu — chỉ là danh sách ai đang mở kênh.
// ============================================================================

let cached: SupabaseClient | null = null;

/** `null` khi chưa cấu hình — chỗ gọi phải tự ẩn tính năng, không được nổ. */
export async function getBrowserClient(): Promise<SupabaseClient | null> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    cached = createClient(url, key, {
      auth: { persistSession: false },
      // Giới hạn nhịp gói tin: mặc định của thư viện cao hơn nhiều so với việc
      // đếm người xem cần, để nguyên là tốn băng thông vô ích.
      realtime: { params: { eventsPerSecond: 1 } },
    });
    return cached;
  } catch {
    return null; // mạng hỏng lúc tải thư viện → ẩn chip, không phá trang
  }
}
