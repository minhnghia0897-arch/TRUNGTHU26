-- =====================================================================
-- Doran King · các cột vận hành cho bảng điều hành
--
-- `shipment` (một kiện = một dòng ở trang Đơn hàng) đang thiếu vài trường mà
-- dashboard cần: trạng thái do mình tự quản, người phụ trách, tóm tắt sản
-- phẩm, định mức tiêu hao kho, cờ đã xoá.
--
-- Phân biệt hai cột trạng thái (theo CLAUDE.md §15 — web-native vs mirror):
--   status          → do dashboard sở hữu, nhân viên tự đổi.
--   tracking_status → bản sao từ webhook Pancake sau này, KHÔNG sửa tay.
-- =====================================================================

alter table shipment add column if not exists status          text not null default 'Mới';
alter table shipment add column if not exists assignee        text;
alter table shipment add column if not exists product_summary text;
alter table shipment add column if not exists consume         jsonb;
alter table shipment add column if not exists stock_applied   boolean not null default false;
alter table shipment add column if not exists voided          boolean not null default false;
-- kiện thứ mấy trên tổng số — dùng dựng khoá hiển thị `<mã đơn>-<số kiện>`
alter table shipment add column if not exists parcel_index    int not null default 1;
alter table shipment add column if not exists parcel_count    int not null default 1;
alter table shipment add column if not exists updated_at      timestamptz not null default now();

create index if not exists idx_shipment_status on shipment(status);
create index if not exists idx_shipment_voided on shipment(voided);

-- ---------- lịch sử thao tác ----------
-- Thay cho localStorage `tr_order_history`. Append-only, không sửa.
create table if not exists order_history (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipment(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text not null default 'Bạn',
  changes     jsonb not null default '[]'::jsonb   -- ["Trạng thái: Mới → Đã xác nhận", ...]
);

create index if not exists idx_order_history_shipment on order_history(shipment_id, at desc);

alter table order_history enable row level security;
-- Không tạo policy → chỉ service role đọc/ghi được (§4.3).
