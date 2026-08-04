-- =====================================================================
-- Trăng Rằm · schema khởi tạo (khớp CLAUDE.md §4)
-- Nguyên tắc: money = integer đơn vị nhỏ nhất (đ / ₩); money trên web_order
-- luôn ở tiền tệ NGƯỜI ĐẶT. Hai trục vùng độc lập (§2).
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---------- enum ----------
create type region_t          as enum ('vn','kr');
create type currency_t        as enum ('vnd','krw');
create type ship_mode_t       as enum ('separate','included');
create type flavor_weight_t   as enum ('150','60');
create type line_kind_t       as enum ('box','combo','la');
create type order_source_t    as enum ('web','facebook','pos');
create type payment_status_t  as enum ('pending','paid','canceled','refunded');
create type fulfillment_t     as enum
  ('draft','pending_payment','paid','pushing','pushed','partially_pushed','push_failed','canceled');
create type push_status_t     as enum ('pending','pushed','failed');

-- ---------- danh mục ----------
create table warehouse (
  id             uuid primary key default gen_random_uuid(),
  region         region_t not null,
  name           text not null,
  shipping_mode  ship_mode_t not null default 'separate',
  fee_table      jsonb not null default '{}'::jsonb,   -- { ship, handling, ... } theo local_currency
  local_currency currency_t not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table box (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  weight                smallint not null check (weight in (150,60)),
  slots                 smallint not null check (slots > 0),
  price_vn              bigint not null check (price_vn >= 0),
  price_kr              bigint not null check (price_kr >= 0),
  allowed_flavor_weight smallint not null check (allowed_flavor_weight in (150,60)),
  specs                 jsonb not null default '{}'::jsonb,
  active                boolean not null default true
);

create table flavor (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  weight               smallint not null check (weight in (150,60)),
  premium              boolean not null default false,
  premium_surcharge_vn bigint not null default 0 check (premium_surcharge_vn >= 0),
  premium_surcharge_kr bigint not null default 0 check (premium_surcharge_kr >= 0),
  price_vn             bigint not null check (price_vn >= 0),   -- giá mua lẻ
  price_kr             bigint not null check (price_kr >= 0),
  sort                 int not null default 0,
  active               boolean not null default true
);

create table combo (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  box_id     uuid not null references box(id),
  flavor_ids jsonb not null default '[]'::jsonb,   -- [flavor_id, ...] cố định
  active     boolean not null default true
);

create table app_config (
  key        text primary key,        -- 'fx_rate', 'bank_vn', 'bank_kr', 'low_stock_threshold', ...
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- khách ----------
create table customer (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text not null unique,     -- chuẩn hoá E.164 trước khi ghi
  region              region_t not null,        -- vùng người đặt
  pancake_customer_id text,
  pancake_shop        text,
  created_at          timestamptz not null default now()
);

-- ---------- đơn ----------
create table web_order (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,       -- mã ngắn cho tra cứu / hiển thị
  customer_id        uuid not null references customer(id),
  buyer_region       region_t not null,
  currency           currency_t not null,        -- = tiền tệ người đặt
  fx_rate_snapshot   numeric not null,           -- tỉ giá chốt lúc tạo đơn (krw↔vnd)
  subtotal           bigint not null default 0 check (subtotal >= 0),
  shipping_total     bigint not null default 0 check (shipping_total >= 0),
  handling_total     bigint not null default 0 check (handling_total >= 0),
  grand_total        bigint not null default 0 check (grand_total >= 0),
  payment_status     payment_status_t not null default 'pending',
  fulfillment_status fulfillment_t not null default 'draft',
  transfer_code      text not null unique,       -- nội dung CK để đối soát
  utm                jsonb,                       -- nguồn/UTM để đo web-direct vs chat (§12)
  paid_at            timestamptz,
  canceled_at        timestamptz,
  created_at         timestamptz not null default now()
);

create table recipient (
  id           uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references web_order(id) on delete cascade,
  name         text not null,
  phone        text not null,
  address      text not null,
  region       region_t not null,               -- vùng giao = quyết kho
  desired_date date
);

create table order_line (
  id           uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references web_order(id) on delete cascade,
  recipient_id uuid references recipient(id) on delete set null,
  kind         line_kind_t not null,
  box_id       uuid references box(id),
  combo_id     uuid references combo(id),
  flavors      jsonb,                            -- [flavor_id, ...] cho hộp tự chọn
  qty          int not null default 1 check (qty >= 1),
  unit_price   bigint not null check (unit_price >= 0),   -- snapshot, tiền tệ người đặt
  line_total   bigint not null check (line_total >= 0),
  price_source jsonb                              -- snapshot giá gốc để đối soát
);

create table shipment (
  id                 uuid primary key default gen_random_uuid(),
  web_order_id       uuid not null references web_order(id) on delete cascade,
  recipient_id       uuid not null references recipient(id) on delete cascade,
  fulfillment_region region_t not null,
  warehouse_id       uuid not null references warehouse(id),
  shipping_fee       bigint not null default 0 check (shipping_fee >= 0),
  handling_fee       bigint not null default 0 check (handling_fee >= 0),
  shipping_mode      ship_mode_t not null,
  -- đẩy Pancake (idempotent §10.2)
  push_status        push_status_t not null default 'pending',
  push_attempts      int not null default 0,
  idempotency_key    text not null unique,
  pancake_order_id   text,
  -- tracking (mirror từ webhook §10.4/§10.5)
  vc_code            text,
  carrier            text,
  tracking_status    text,                        -- theo pipeline Pancake
  -- tài chính đơn khớp Pancake
  cod                bigint not null default 0,
  prepaid            bigint not null default 0,
  cuoc_vc            bigint not null default 0,
  phi_vc_thu_khach   bigint not null default 0,
  tags               jsonb not null default '[]'::jsonb,
  note               text,
  source             order_source_t not null default 'web',
  unique (web_order_id, recipient_id)             -- recipient 1—1 shipment
);

-- ---------- tích hợp ----------
create table order_links (
  token               text primary key,
  page_id             text,
  psid                text,
  pancake_customer_id text,
  pancake_shop        text,
  used                boolean not null default false,
  created_at          timestamptz not null default now()
);

create table webhook_event (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  external_id  text not null,                     -- id event từ Pancake → chống xử lý lặp
  payload      jsonb not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (provider, external_id)
);

-- ---------- index ----------
create index idx_web_order_customer  on web_order(customer_id);
create index idx_web_order_status    on web_order(payment_status, fulfillment_status);
create index idx_recipient_order     on recipient(web_order_id);
create index idx_order_line_order    on order_line(web_order_id);
create index idx_order_line_recip    on order_line(recipient_id);
create index idx_shipment_order      on shipment(web_order_id);
create index idx_shipment_push       on shipment(push_status);
create index idx_shipment_pancake    on shipment(pancake_order_id);

-- =====================================================================
-- RLS (§4.3): client chỉ đọc danh mục active; bảng đơn chỉ truy cập qua
-- service role (API route/Edge Function). Không mở đọc bảng đơn cho anon.
-- =====================================================================
alter table warehouse     enable row level security;
alter table box           enable row level security;
alter table flavor        enable row level security;
alter table combo         enable row level security;
alter table app_config    enable row level security;
alter table customer      enable row level security;
alter table web_order     enable row level security;
alter table recipient     enable row level security;
alter table order_line    enable row level security;
alter table shipment      enable row level security;
alter table order_links   enable row level security;
alter table webhook_event enable row level security;

-- danh mục: anon/auth chỉ SELECT bản ghi active
create policy cat_read_warehouse on warehouse for select using (active);
create policy cat_read_box       on box       for select using (active);
create policy cat_read_flavor    on flavor    for select using (active);
create policy cat_read_combo     on combo     for select using (active);

-- app_config: chỉ đọc các key công khai (fx_rate, bank_* để dựng QR)
create policy cfg_read_public on app_config for select
  using (key in ('fx_rate','bank_vn','bank_kr'));

-- Các bảng đơn + webhook + order_links: KHÔNG có policy cho anon/auth
--   → mọi thao tác đi qua service role (bypass RLS). Đây là chủ ý (§4.3).
