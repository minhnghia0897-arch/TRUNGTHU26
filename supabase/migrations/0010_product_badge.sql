-- =====================================================================
-- Doran King · huy hiệu sản phẩm lưu trong database
--
-- Trang bán đang hardcode badge="best_seller" cho MỌI thẻ combo, nên cả ba bộ
-- quà tặng đều đeo "Best Seller" — nói sai với khách, mà menu chỉ có Kim Ngọc
-- Các là best seller.
--
-- Kiểu Badge đã có sẵn trong code từ lâu nhưng chưa bao giờ có cột thật để đọc.
-- Thêm cột, để trang bán đọc từ dữ liệu thay vì tự bịa.
-- =====================================================================

alter table box    add column if not exists badge text;
alter table flavor add column if not exists badge text;
alter table combo  add column if not exists badge text;

do $$
declare t text;
begin
  foreach t in array array['box','flavor','combo'] loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_badge_check');
    execute format(
      'alter table %I add constraint %I check (badge is null or badge in (''best_seller'',''must_try''))',
      t, t || '_badge_check');
  end loop;
end $$;

comment on column combo.badge is
  'Huy hiệu hiện trên thẻ sản phẩm: best_seller | must_try | NULL (không có).';
