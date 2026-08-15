-- =====================================================================
-- Doran King · ảnh sản phẩm
--
-- Trước đây ảnh được lưu base64 trong localStorage của máy quản trị, nên
-- khách vào web không thấy ảnh nào. Giờ ảnh nằm ở Supabase Storage, chỉ lưu
-- URL công khai trong cột `images`.
-- =====================================================================

alter table box    add column if not exists images text[] not null default '{}';
alter table flavor add column if not exists images text[] not null default '{}';
alter table combo  add column if not exists images text[] not null default '{}';

-- ---------- bucket ảnh ----------
-- public = true → ảnh đọc được không cần token, hợp với trang bán hàng.
-- Ghi/xoá chỉ qua service role ở API route (service role bỏ qua RLS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5 * 1024 * 1024,                                    -- 5MB/ảnh
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cho phép ai cũng ĐỌC ảnh trong bucket này (không mở ghi cho anon).
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');
