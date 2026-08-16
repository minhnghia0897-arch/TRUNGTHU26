// ============================================================================
// Đường dẫn mở cuộc chat Messenger từ một đơn.
//
// PSID (Page-Scoped ID) là định danh của khách VỚI MỘT TRANG cụ thể — cùng một
// người, hai Trang khác nhau là hai PSID khác nhau. Nên không có Page ID thì
// không dựng được đường dẫn, chỉ biết mỗi tên khách.
//
// Không dùng service client nên client component import được.
// ============================================================================

/**
 * Mở đúng cuộc chat trong hộp thư Trang (Meta Business Suite).
 *
 * PHẢI ĐỦ CẢ BỐN THAM SỐ. Bản đầu chỉ gửi `asset_id` + `selected_item_id` nên
 * Business Suite mở hộp thư chung rồi bỏ qua luôn cuộc chat được chỉ định:
 * thiếu `mailbox_id` thì nó không biết mở cuộc chat trong hộp thư nào.
 *
 * Hình dạng dưới đây chép đúng theo một đường dẫn đã xác nhận chạy được, kể cả
 * dấu `/` cuối `all/`. Tham số `nav_ref` trong đường dẫn gốc chỉ là dấu vết
 * điều hướng của Meta nên bỏ.
 *
 * Trả `null` khi thiếu Page ID hoặc PSID — chỗ gọi phải tự xử, đừng dựng link
 * cụt rồi để anh chủ bấm vào một trang lỗi.
 */
export function messengerInboxUrl(pageId?: string, psid?: string): string | null {
  const p = pageId?.trim();
  const s = psid?.trim();
  if (!p || !s) return null;

  // Cả hai phải là số trần. Dữ liệu cũ còn dính `{{…}}`; dựng link từ đó thì
  // Facebook bỏ qua và mở hộp thư chung — thà không có nút còn hơn nút sai chỗ.
  if (!/^\d+$/.test(p) || !/^\d+$/.test(s)) return null;

  const q = new URLSearchParams({
    asset_id: p,
    mailbox_id: p, // hộp thư của chính Trang đó
    selected_item_id: s,
    thread_type: "FB_MESSAGE",
  });
  return `https://business.facebook.com/latest/inbox/all/?${q.toString()}`;
}
