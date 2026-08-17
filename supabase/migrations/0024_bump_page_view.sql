-- Ghi một lượt xem: khách mới thì thêm dòng, khách cũ thì cộng `hits`.
--
-- Phải làm trong MỘT câu lệnh vì hai người mở web cùng lúc mà tách "đọc rồi
-- ghi" ở tầng ứng dụng thì một lượt sẽ mất. `on conflict` để Postgres tự lo.
create or replace function bump_page_view(p_day date, p_visitor text)
returns void
language sql
as $$
  insert into page_view (day, visitor) values (p_day, p_visitor)
  on conflict (day, visitor)
  do update set hits = page_view.hits + 1, last_seen = now();
$$;

-- Chỉ máy chủ (service role) được gọi. Trang khách gọi qua /api/track chứ không
-- đụng thẳng vào database — hở hàm này ra là ai cũng bơm số được.
revoke all on function bump_page_view(date, text) from public;
revoke all on function bump_page_view(date, text) from anon;
revoke all on function bump_page_view(date, text) from authenticated;
