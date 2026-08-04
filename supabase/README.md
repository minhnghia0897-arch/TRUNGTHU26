# Supabase — Trăng Rằm

Schema + seed cho website (khớp `CLAUDE.md` §4).

## File
- `migrations/0001_init.sql` — bảng, enum, index, RLS.
- `migrations/0002_seed.sql` — dữ liệu mẫu dev (config, kho, hộp, vị, combo).

## Áp dụng

**Cách A — Supabase CLI (khuyến nghị)**
```bash
supabase db push          # áp migrations/ lên project đã link
# hoặc chạy local:
supabase start
supabase db reset         # dựng lại + chạy seed
```

**Cách B — SQL Editor trên dashboard**
Dán nội dung `0001_init.sql` rồi `0002_seed.sql` chạy theo thứ tự.

## Nguyên tắc quan trọng (đừng phá)
- **Money = integer đơn vị nhỏ nhất** (đ / ₩). Không dùng float cho tiền.
- Money trên `web_order` luôn ở **tiền tệ người đặt**; chốt `fx_rate_snapshot` lúc tạo đơn.
- **RLS**: client chỉ đọc danh mục `active` + vài key `app_config` công khai.
  Mọi thao tác bảng đơn đi qua **service role** (API route / Edge Function) — không mở đọc bảng đơn cho anon.
- Đẩy Pancake idempotent qua `shipment.idempotency_key`; webhook chống lặp qua `webhook_event.external_id`.
