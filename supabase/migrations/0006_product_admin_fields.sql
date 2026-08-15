-- =====================================================================
-- Doran King · các trường trang quản trị sản phẩm đang dùng
--
-- Trước đây những trường này lưu trong localStorage của máy quản trị dưới
-- dạng "override" đè lên danh mục. Hậu quả: anh sửa giá hay đổi tên sản phẩm
-- thì KHÁCH KHÔNG THẤY — vì khách đọc thẳng từ danh mục, không đọc override.
-- Đưa hẳn vào cột thật để chỉ còn một nguồn dữ liệu duy nhất.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['box','flavor','combo'] loop
    execute format('alter table %I add column if not exists code          text', t);
    execute format('alter table %I add column if not exists category      text', t);
    execute format('alter table %I add column if not exists cost          bigint not null default 0', t);
    execute format('alter table %I add column if not exists discount      int    not null default 0', t);
    execute format('alter table %I add column if not exists note          text', t);
    execute format('alter table %I add column if not exists supply_link   text', t);
    -- mẫu mã: [{ name, contents }]
    execute format('alter table %I add column if not exists variants      jsonb  not null default ''[]''::jsonb', t);
    -- liên kết mặt hàng kho theo mã SKU
    execute format('alter table %I add column if not exists stock_key     text', t);
    execute format('alter table %I add column if not exists allow_negative boolean not null default false', t);
    -- thùng rác: ẩn khỏi danh sách nhưng còn khôi phục được
    execute format('alter table %I add column if not exists removed       boolean not null default false', t);
  end loop;
end $$;

-- Sản phẩm đã bỏ vào thùng rác thì khách không được thấy nữa, kể cả khi
-- vẫn còn active. Siết lại policy đọc công khai cho khớp.
drop policy if exists cat_read_box    on box;
drop policy if exists cat_read_flavor on flavor;
drop policy if exists cat_read_combo  on combo;

create policy cat_read_box    on box    for select using (active and not removed);
create policy cat_read_flavor on flavor for select using (active and not removed);
create policy cat_read_combo  on combo  for select using (active and not removed);
