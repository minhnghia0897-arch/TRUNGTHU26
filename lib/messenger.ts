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
 * Moi một tham số ra khỏi đường dẫn hộp thư đã dán vào.
 *
 * Ai cũng có sẵn đường dẫn đó trên thanh địa chỉ, nên bắt người ta tự tìm đúng
 * con số giữa ba số na ná nhau là bắt họ làm việc của máy — và đã dẫn tới đủ
 * kiểu dán nhầm: dán cả URL, dán ID Trang vào ô ID khách, dán kèm `{{ }}`.
 */
function fromUrl(input: string, keys: string[]): string {
  for (const k of keys) {
    const m = input.match(new RegExp(`[?&]${k}=(\\d+)`));
    if (m) return m[1];
  }
  return "";
}

/**
 * Link hội thoại Pancake, nếu người dùng dán thẳng nó vào.
 *
 * Pancake trả sẵn `conversation_link` cho từng khách. Dùng thẳng thì khỏi phải
 * tự chế link từ Page ID + PSID — chính chỗ tự chế đó đã hỏng bốn lượt liên
 * tiếp vì bắt người ta copy tay đúng một con số giữa ba số na ná nhau.
 */
export function parseConversationLink(input: string): string {
  const v = (input ?? "").trim();
  return /^https?:\/\/(www\.)?pancake\.vn\//i.test(v) ? v : "";
}

/** Ô "ID Trang": nhận cả URL hộp thư lẫn số trần. */
export function parsePageId(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  return fromUrl(v, ["asset_id", "mailbox_id"]) || v.replace(/\D/g, "");
}

/**
 * Ô "ID khách": nhận cả URL hộp thư lẫn số trần.
 *
 * Chỉ lấy `selected_item_id`. Nếu dán URL mà không có tham số đó thì trả rỗng
 * chứ KHÔNG vơ đại số khác trong URL — vơ nhầm `asset_id` là lưu ID Trang vào
 * chỗ khách, đúng lỗi đã gặp.
 */
export function parseCustomerId(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || v.includes("=")) return fromUrl(v, ["selected_item_id"]);
  // UUID để nguyên — mã khách Pancake là UUID, bóc hết chữ là mất sạch.
  if (/^[0-9a-f-]{20,}$/i.test(v)) return v;
  return v.replace(/\D/g, "");
}

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
