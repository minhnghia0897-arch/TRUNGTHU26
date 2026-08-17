-- Đếm khách vào web, theo NGÀY.
--
-- Một dòng = một khách trong một ngày, nên đếm số dòng của hôm nay là ra "bao
-- nhiêu người vào web hôm nay", không phải đi gom nhóm gì cả. `hits` cộng dồn số
-- trang họ đã mở.
--
-- `visitor` là HMAC của (ngày + IP + trình duyệt), khoá HMAC là bí mật máy chủ.
-- Cố ý nhét NGÀY vào trong hash: hash đổi mỗi ngày nên không lần được một người
-- qua nhiều ngày, và bảng này không giữ IP thô của ai cả. Không dùng cookie nên
-- cũng không phải xin phép khách.
create table if not exists page_view (
  day date not null,
  visitor text not null,
  hits integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (day, visitor)
);

create index if not exists page_view_day_idx on page_view (day desc);

-- Bật RLS mà KHÔNG tạo policy nào = chỉ service role (máy chủ) đọc/ghi được.
-- Số liệu kinh doanh, không phải thứ để trang khách đọc thẳng từ trình duyệt.
alter table page_view enable row level security;
