-- Bộ vị sẵn cho set khách tự chọn: khách bấm MỘT lần là đủ cả 4 ngăn.
-- Mỗi phần tử: {"name": "SET A", "flavor_ids": [...]}. Trống = chỉ có tự chọn.
alter table combo add column if not exists flavor_presets jsonb not null default '[]'::jsonb;

-- Bốn bộ shop chốt cho Kim Ngọc Các và Vinh Hiển (ruột 150g).
-- Tra vị theo TÊN để khỏi dán tay uuid. Danh mục có vài vị TRÙNG TÊN (một dòng
-- "Thập Cẩm Gà Quay" ngoài ruột set, một dòng "Socola Dừa Chảy" cũ đã tắt) nên
-- chỉ lấy dòng ĐANG BẬT và thật sự nằm trong ruột hai set này.
with f as (
  select name, id
  from flavor
  where weight = 150
    and active and not removed
    and id in (
      select jsonb_array_elements_text(flavor_ids)::uuid
      from combo
      where name in ('Kim Ngọc Các', 'Vinh Hiển')
    )
),
p as (
  select jsonb_build_array(
    jsonb_build_object('name', 'SET A', 'flavor_ids', jsonb_build_array(
      (select id from f where name = 'Lava Trứng Muối Chảy'),
      (select id from f where name = 'Trà Xanh Đậu Đỏ Kem Cheese'),
      (select id from f where name = 'Thập Cẩm Gà Quay'),
      (select id from f where name = 'Đậu Xanh Hạt Dưa Trứng Muối'))),
    jsonb_build_object('name', 'SET B', 'flavor_ids', jsonb_build_array(
      (select id from f where name = 'Lava Trứng Muối Chảy'),
      (select id from f where name = 'Trà Xanh Đậu Đỏ Kem Cheese'),
      (select id from f where name = 'Dẻo Kem Trứng Muối'),
      (select id from f where name = 'Socola Dừa Chảy'))),
    jsonb_build_object('name', 'SET C', 'flavor_ids', jsonb_build_array(
      (select id from f where name = 'Lava Trứng Muối Chảy'),
      (select id from f where name = 'Trà Xanh Đậu Đỏ Kem Cheese'),
      (select id from f where name = 'Thập Cẩm Gà Quay'),
      (select id from f where name = 'Dẻo Kem Trứng Muối'))),
    jsonb_build_object('name', 'SET D', 'flavor_ids', jsonb_build_array(
      (select id from f where name = 'Lava Trứng Muối Chảy'),
      (select id from f where name = 'Trà Xanh Đậu Đỏ Kem Cheese'),
      (select id from f where name = 'Đậu Xanh Hạt Dưa Trứng Muối'),
      (select id from f where name = 'Socola Dừa Chảy')))
  ) as v
)
update combo set flavor_presets = (select v from p)
where name in ('Kim Ngọc Các', 'Vinh Hiển');
