-- §0025 — Set cho khách TỰ CHỌN vị.
--
-- Trước đây một set cao cấp bán theo "loại nhân" cố định: mỗi lựa chọn là một
-- bộ 4 vị đóng cứng, khách thích 2 vị bên này 2 vị bên kia thì chịu. Giờ shop
-- gộp lại thành một danh sách vị chung và để khách tự bốc.
--
-- `pick_count` = số bánh khách phải chọn. 0 (mặc định) = giữ nguyên nếp cũ, set
-- bán theo bộ vị cố định. Lớn hơn 0 = khách chọn đúng chừng đó bánh trong
-- `flavor_ids`, và `flavor_ids` lúc này là DANH SÁCH ĐƯỢC PHÉP chọn chứ không
-- còn là ruột hộp.
--
-- Giá KHÔNG đổi theo vị: một set một giá, lấy `price_vn`/`price_kr` của chính
-- set. Chọn vị nào cũng bằng tiền nên khách không phải tính nhẩm, và máy chủ
-- chốt giá gọn.
alter table combo add column if not exists pick_count int not null default 0;

comment on column combo.pick_count is
  'Số bánh khách tự chọn trong flavor_ids. 0 = set bộ vị cố định (nếp cũ).';
