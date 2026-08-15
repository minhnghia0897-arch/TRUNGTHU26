-- =====================================================================
-- Doran King · set cố định có giá của chính nó
--
-- Trước đây combo không có giá: giá suy ra từ hộp mà nó trỏ tới, cộng phụ thu
-- từng vị. Kiểu đó chỉ đúng khi combo là "hộp tự chọn đã điền sẵn".
--
-- Menu 2026 bán theo set: cùng một quy cách hộp nhưng hai mức giá theo loại
-- nhân (VD Vinh Hiển 55.000₩ nhân đặc biệt / 60.000₩ nhân cổ truyền). Không có
-- giá riêng thì không diễn tả được, phải bịa ra hộp ma chỉ để đỡ giá.
--
-- NULL = giữ nếp cũ, suy giá từ hộp. Có giá = giá đó là giá bán, hộp chỉ còn
-- là thông tin quy cách.
-- =====================================================================

alter table combo add column if not exists price_vn bigint;
alter table combo add column if not exists price_kr bigint;

comment on column combo.price_vn is
  'Giá bán set ở VN (đồng). NULL = suy từ hộp như cũ.';
comment on column combo.price_kr is
  'Giá bán set ở Hàn (won). NULL = suy từ hộp như cũ.';

-- Giá âm là lỗi nhập liệu, chặn ngay ở database thay vì đợi phát hiện trên đơn.
alter table combo drop constraint if exists combo_price_nonneg;
alter table combo add constraint combo_price_nonneg
  check (coalesce(price_vn, 0) >= 0 and coalesce(price_kr, 0) >= 0);
