-- =====================================================================
-- Doran King · bỏ khoá cứng khối lượng bánh
--
-- Schema ban đầu chốt weight ∈ {150, 60} — đoán theo hai cỡ lúc dựng. Menu 2026
-- có hộp 6 bánh mini 75g nên chèn dữ liệu thật là vỡ constraint.
--
-- Liệt kê sẵn từng cỡ thì cứ ra cỡ mới lại phải sửa database. Đổi thành "phải
-- là số dương" — vẫn chặn được 0 và số âm, là hai thứ chắc chắn sai, còn cỡ nào
-- bán thì để menu quyết.
-- =====================================================================

alter table flavor drop constraint if exists flavor_weight_check;
alter table flavor add constraint flavor_weight_check check (weight > 0);

alter table box drop constraint if exists box_weight_check;
alter table box add constraint box_weight_check check (weight > 0);

alter table box drop constraint if exists box_allowed_flavor_weight_check;
alter table box add constraint box_allowed_flavor_weight_check
  check (allowed_flavor_weight > 0);
