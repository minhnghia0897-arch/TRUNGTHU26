-- =====================================================================
-- Trăng Rằm · thêm mô tả sản phẩm (cho trang chọn sản phẩm chi tiết)
-- =====================================================================

alter table box    add column if not exists description text;
alter table flavor add column if not exists description text;
alter table combo  add column if not exists description text;

-- cập nhật mô tả cho seed hiện có
update box set description = 'Vỏ hộp gấm đỏ dập nổi hoa văn gold, 6 ô — tự chọn từng vị. Quà biếu sang trọng.'
  where name = 'Hộp gấm 6 vị';
update box set description = 'Hộp 4 ô gọn nhẹ, hợp ăn nhà hoặc biếu thân mật.'
  where name = 'Set Đoàn Viên';

update flavor set description = 'Nhân thập cẩm truyền thống: mứt bí, hạt sen, lạp xưởng, gà quay, mỡ đường.' where name = 'Thập cẩm gà quay';
update flavor set description = 'Sen sên tay mịn, 1 trứng muối tan bùi.' where name = 'Sen nhuyễn trứng';
update flavor set description = 'Nhân trà xanh Nhật, ngọt thanh, ít gắt.' where name = 'Trà xanh';
update flavor set description = 'Đậu đỏ hầm nhuyễn, ngọt dịu.' where name = 'Đậu đỏ';
update flavor set description = 'Nhân cao cấp vi cá + bào ngư, đậm đà, dành cho quà biếu trọng.' where name = 'Vi cá · bào ngư';
update flavor set description = 'Nhân yến sào thượng hạng, thanh nhẹ, bổ dưỡng.' where name = 'Yến sào';

update combo set description = '4 vị best-seller mix sẵn: thập cẩm, sen trứng, trà xanh, đậu đỏ.'
  where name = 'Set Đoàn Viên';
