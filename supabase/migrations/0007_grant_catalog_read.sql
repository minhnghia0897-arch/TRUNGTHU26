-- =====================================================================
-- Doran King · quyền đọc danh mục cho khách
--
-- Lúc dọn database cũ bằng `drop schema public cascade`, mọi quyền mặc định
-- Supabase cấp sẵn cho vai trò `anon` mất theo. Kết quả: khách mở trang bán bị
-- "permission denied for table flavor" dù RLS đã có policy đầy đủ.
--
-- Nhớ hai lớp này khác nhau:
--   GRANT  quyết định CÓ ĐƯỢC ĐỤNG VÀO BẢNG không.
--   RLS    quyết định ĐỌC ĐƯỢC DÒNG NÀO.
-- Thiếu một trong hai là hỏng.
-- =====================================================================

grant select on table warehouse  to anon, authenticated;
grant select on table box        to anon, authenticated;
grant select on table flavor     to anon, authenticated;
grant select on table combo      to anon, authenticated;
grant select on table app_config to anon, authenticated;

-- CỐ Ý không cấp gì trên customer, web_order, recipient, order_line, shipment,
-- order_history, order_links, webhook_event (§4.3): mọi thao tác với đơn đi qua
-- API route dùng service role. Chặt hơn mặc định của Supabase — nếu sau này lỡ
-- tắt RLS một bảng đơn thì cũng không lộ dữ liệu khách ra ngoài.
