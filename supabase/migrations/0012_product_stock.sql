-- =====================================================================
-- Doran King · tồn kho nằm trên chính sản phẩm
--
-- Trước đây tồn kho là dữ liệu mẫu hardcode trong lib/inventory.ts, số lượng
-- lưu ở localStorage TRÌNH DUYỆT. Ba hậu quả:
--   1. Số liệu là hàng bịa của menu cũ (120 vỏ gấm, 210 bánh sen…)
--   2. Mỗi máy một con số khác nhau, xoá cache là mất
--   3. Khách đặt hàng thì trừ kho trong trình duyệt của KHÁCH — chủ shop
--      không bao giờ thấy
--
-- Nay tồn nằm cùng bản ghi sản phẩm, và chỉ máy chủ được trừ.
--
-- allow_negative đã có sẵn từ §0006 nhưng chưa ai đọc; giờ nó quyết định có
-- chặn đơn khi hết hàng hay không.
-- =====================================================================

alter table box    add column if not exists stock integer not null default 0;
alter table flavor add column if not exists stock integer not null default 0;
alter table combo  add column if not exists stock integer not null default 0;

comment on column combo.stock is
  'Số lượng còn bán được. Trừ ở máy chủ lúc tạo đơn; âm = đã bán quá số có thật.';
