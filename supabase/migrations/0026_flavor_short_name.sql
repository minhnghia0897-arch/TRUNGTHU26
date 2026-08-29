-- Tên gọn của vị bánh — dùng ở chỗ hiển thị chật: chuỗi sản phẩm trên đơn,
-- khay 4 ngăn, bảng quản đơn của đại lý. Trống thì lấy tên đầy đủ.
alter table flavor add column if not exists short_name text not null default '';

-- Tên gọn ban đầu cho các vị 150g tên dài (anh chủ sửa lại được ở Dashboard).
update flavor set short_name = 'Lava'            where name = 'Lava Trứng Muối Chảy';
update flavor set short_name = 'Matcha Trà Xanh' where name = 'Trà Xanh Đậu Đỏ Kem Cheese';
update flavor set short_name = 'Dẻo'             where name = 'Dẻo Kem Trứng Muối';
update flavor set short_name = 'Thập Cẩm'        where name = 'Thập Cẩm Gà Quay';
update flavor set short_name = 'Đậu Xanh'        where name = 'Đậu Xanh Hạt Dưa Trứng Muối';
update flavor set short_name = 'Socola Dừa'      where name = 'Socola Dừa Chảy';
