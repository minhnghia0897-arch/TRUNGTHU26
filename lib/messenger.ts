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
 * Trả `null` khi thiếu Page ID hoặc PSID — chỗ gọi phải tự xử, đừng dựng link
 * cụt rồi để anh chủ bấm vào một trang lỗi.
 */
export function messengerInboxUrl(pageId?: string, psid?: string): string | null {
  const p = pageId?.trim();
  const s = psid?.trim();
  if (!p || !s) return null;
  return `https://business.facebook.com/latest/inbox/all?asset_id=${encodeURIComponent(p)}&selected_item_id=${encodeURIComponent(s)}`;
}
