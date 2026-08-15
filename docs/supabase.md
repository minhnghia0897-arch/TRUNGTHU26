# Nối Supabase — nơi lưu đơn hàng và sản phẩm

Không cấu hình thì web vẫn chạy: trang bán hàng dùng danh mục mẫu, bảng điều hành
hiện 18 đơn mẫu và ghi rõ *"Chế độ xem thử"*. **Nhưng đơn khách đặt sẽ không được
lưu ở đâu cả.** Cấu hình xong là đơn tự vào database, mở máy nào cũng thấy.

---

## Database đã dựng sẵn

Project Supabase: **NGHIA** (`quizttvwqovuatiznuyz`).

Đã chạy 5 migration trong `supabase/migrations/`:

| Bảng | Việc |
|---|---|
| `warehouse` `box` `flavor` `combo` `app_config` | danh mục, giá VN/Hàn, tỉ giá, số tài khoản |
| `customer` `web_order` `recipient` `order_line` `shipment` | đơn hàng — **một kiện = một bản ghi `shipment`** |
| `order_history` | nhật ký thao tác trên từng kiện |
| `order_links` `webhook_event` | dành cho Pancake sau này |

Kèm bucket Storage **`product-images`** cho ảnh sản phẩm (đọc công khai, ghi chỉ
qua service role, tối đa 5MB mỗi ảnh).

---

## Ba biến môi trường cần cắm

Vào Vercel → project → **Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL       = https://quizttvwqovuatiznuyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = (Supabase → Settings → API Keys → anon / publishable)
SUPABASE_SERVICE_ROLE_KEY      = (Supabase → Settings → API Keys → service_role)
DASHBOARD_PASSWORD             = (mật khẩu anh tự đặt để vào bảng điều hành)
```

Xong thì **deploy lại** — biến `NEXT_PUBLIC_*` được nhúng lúc build nên phải build
mới ăn.

> **`service_role` là chìa khoá vạn năng của database** — bỏ qua mọi luật phân
> quyền. Chỉ dán vào biến môi trường phía máy chủ, tuyệt đối không đưa vào code
> chạy ở trình duyệt, không gửi qua chat, không commit vào git.

### Vì sao bắt buộc có `DASHBOARD_PASSWORD`

Khi đã nối database thật mà chưa đặt mật khẩu, API đơn hàng **từ chối trả dữ
liệu** và báo lỗi. Đây là cố ý: không có chốt này, quên đặt mật khẩu là công khai
tên, số điện thoại, địa chỉ của toàn bộ khách cho bất kỳ ai biết đường dẫn
`/dashboard`.

---

## Ai đọc được gì (RLS)

Theo `CLAUDE.md` §4.3:

- **Danh mục** (`box`, `flavor`, `combo`, `warehouse`) — khách xem web đọc được,
  nhưng chỉ những bản ghi `active = true`. Sửa thì phải qua service role.
- **`app_config`** — khách chỉ đọc được 3 khoá công khai (`fx_rate`, `bank_vn`,
  `bank_kr`) để dựng mã QR chuyển khoản. Các khoá khác ẩn.
- **Bảng đơn** (`web_order`, `recipient`, `order_line`, `shipment`,
  `order_history`, `customer`) — **không mở cho trình duyệt**. Mọi thao tác đi qua
  API route chạy ở máy chủ bằng service role.

---

## Kiểm tra sau khi cắm biến

1. Mở `/dashboard/don-hang` → dải chữ *"Chế độ xem thử"* phải **biến mất** và bảng
   trống (chưa có đơn thật nào).
2. Đặt thử một đơn ở `/dat-hang`, chọn **2 người nhận khác vùng** (một ở Hàn, một
   ở VN) với số lượng khác nhau.
3. Mở lại `/dashboard/don-hang` **bằng trình duyệt khác** hoặc cửa sổ ẩn danh →
   phải thấy **2 kiện** vừa đặt. Đây là phép thử quyết định: trước đây đơn chỉ nằm
   trên máy khách nên bảng luôn trống.
4. Cộng tiền 2 kiện phải đúng bằng tổng đơn, và cùng một đơn vị tiền — tiền theo
   **vùng người đặt**, không theo kho giao.
5. Đổi trạng thái một kiện → tải lại trang → trạng thái còn nguyên. Trang *Khách
   hàng* và *Thu chi* hiện cùng số liệu.
6. Vào `/dashboard/san-pham`, mở một hộp, **tải lên 4 ảnh** và sửa giá → mở
   `/san-pham` bằng **cửa sổ ẩn danh** → phải thấy đủ ảnh và giá mới. Trước đây
   ảnh chỉ nằm trên máy đã upload nên khách thấy khung trắng.
7. Vào `/tra-cuu` nhập SĐT vừa đặt, **ở máy khác** → phải ra đúng đơn kèm tiến độ
   từng kiện.

---

## Những thứ chưa tự động

- **Tồn kho.** `lib/stockStore.ts` vẫn lưu trên trình duyệt, và việc trừ kho chạy ở
  máy khách nên **đơn đặt từ web không tự trừ kho**. Định mức tiêu hao đã được lưu
  sẵn ở cột `shipment.consume` để chuyển việc trừ kho về máy chủ ở đợt sau.
- **Pancake** — đẩy đơn sang POS và nhận trạng thái vận chuyển (§10) chưa làm.
