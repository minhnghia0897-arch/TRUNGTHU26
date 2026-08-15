-- =====================================================================
-- Doran King · bộ quà tặng không cần bám vào một vỏ hộp
--
-- Ban đầu combo = "hộp tự chọn đã điền sẵn", nên bắt buộc trỏ tới một `box`.
-- Menu 2026 bán theo bộ quà tặng: set có giá riêng (§0008), mô tả quy cách
-- riêng, và vị nằm trong từng lựa chọn nhân. Vỏ hộp không còn giữ thông tin
-- gì mà set không tự có.
--
-- Hệ quả của ràng buộc cũ: phải tạo ba bản ghi hộp giả ("Quy cách Vinh Hiển"…)
-- chỉ để thoả khoá ngoại. Chúng hiện ra ở trang quản trị như sản phẩm giá 0,
-- không bán, và KHÔNG XOÁ ĐƯỢC vì set đang bám vào.
--
-- Cho phép để trống. Combo cũ vẫn trỏ hộp như thường.
-- =====================================================================

alter table combo alter column box_id drop not null;

comment on column combo.box_id is
  'Vỏ hộp dùng chung quy cách. NULL với set tự mô tả đủ (giá, quy cách, vị).';
