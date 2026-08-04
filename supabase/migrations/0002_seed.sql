-- =====================================================================
-- Trăng Rằm · seed dữ liệu mẫu (dev). Money = integer đơn vị nhỏ nhất.
-- Khớp khối DATA trong các mockup HTML.
-- =====================================================================

-- ---------- config ----------
insert into app_config(key, value) values
  ('fx_rate',             '{"krw_vnd": 18.5}'::jsonb),
  ('bank_vn',             '{"name":"Vietcombank · CTY TRANG RAM","acc":"0123456789","label":"VietQR napas247"}'::jsonb),
  ('bank_kr',             '{"name":"KakaoBank · TRANG RAM","acc":"3333-01-2345678","label":"QR Toss"}'::jsonb),
  ('low_stock_threshold', '{"value": 40}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------- kho ----------
insert into warehouse(region, name, shipping_mode, fee_table, local_currency) values
  ('vn','Kho Việt Nam','separate','{"ship":30000,"handling":0}'::jsonb,'vnd'),
  ('kr','Kho Hàn Quốc','separate','{"ship":3000,"handling":0}'::jsonb,'krw');

-- ---------- hộp ----------
insert into box(name, weight, slots, price_vn, price_kr, allowed_flavor_weight, specs) values
  ('Hộp gấm 6 vị', 150, 6, 480000, 48000, 150, '{"material":"gấm gold"}'::jsonb),
  ('Set Đoàn Viên', 150, 4, 390000, 39000, 150, '{"preset":true}'::jsonb);

-- ---------- vị ----------
insert into flavor(name, weight, premium, premium_surcharge_vn, premium_surcharge_kr, price_vn, price_kr, sort) values
  ('Thập cẩm gà quay', 150, false,     0,    0, 65000, 6500, 1),
  ('Sen nhuyễn trứng', 150, false,     0,    0, 62000, 6200, 2),
  ('Trà xanh',         150, false,     0,    0, 60000, 6000, 3),
  ('Đậu đỏ',           150, false,     0,    0, 58000, 5800, 4),
  ('Vi cá · bào ngư',  150, true,  60000, 6000, 120000,12000, 5),
  ('Yến sào',          150, true,  80000, 8000, 150000,15000, 6);

-- ---------- combo (Set Đoàn Viên = 4 vị cố định) ----------
insert into combo(name, box_id, flavor_ids)
select 'Set Đoàn Viên',
       (select id from box where name='Set Đoàn Viên'),
       (select jsonb_agg(id) from (select id from flavor where premium=false order by sort limit 4) t);
