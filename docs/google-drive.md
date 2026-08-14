# Nối Google Drive để lưu file Excel từ Dashboard

Nút **Xuất Excel** ở trang *Đơn hàng* có 2 lựa chọn:

- **Tải về máy** — chạy được ngay, không cần cấu hình gì.
- **Lưu vào Google Drive** — cần một OAuth Client ID (miễn phí, làm một lần).

---

## Vì sao cần Client ID

Trình duyệt phải xin phép Google trước khi ghi file vào Drive của anh. Web dùng
scope **`drive.file`** — scope hẹp nhất Google có: app **chỉ thấy và sửa được
những file do chính nó tạo ra**, không đọc được bất cứ file nào khác đang có
trong Drive. Vì không phải scope nhạy cảm nên **không cần Google thẩm định**,
tạo xong là dùng luôn.

Client ID **không phải mật khẩu** — nó lộ ra trong mã trang là chuyện bình
thường và an toàn, vì Google chỉ chấp nhận nó khi request đến từ đúng tên miền
đã khai báo.

---

## Các bước lấy Client ID (~5 phút)

1. Vào <https://console.cloud.google.com/> → tạo project mới (đặt tên gì cũng được,
   ví dụ `doran-king`).
2. Vào **APIs & Services → Library** → tìm **Google Drive API** → bấm **Enable**.
3. Vào **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Điền tên app (`Doran King`), email hỗ trợ, email liên hệ nhà phát triển.
   - Ở bước **Audience**, thêm email Google của anh vào **Test users** (hoặc bấm
     **Publish app** để dùng lâu dài — với scope `drive.file` thì không cần thẩm định).
4. Vào **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins** — thêm đủ các tên miền sẽ dùng:
     - `http://localhost:3000` (chạy máy nhà)
     - `https://<tên-miền-thật>.vercel.app` (bản production)
   - Bấm **Create** → copy chuỗi dạng `123456789-abcxyz.apps.googleusercontent.com`.

> Lưu ý: origin phải khớp **chính xác** tên miền đang mở web, kể cả `https://`.
> Bản preview của Vercel có tên miền riêng mỗi lần deploy nên nút Drive sẽ báo lỗi
> ở preview — chỉ hoạt động trên tên miền đã khai báo.

---

## Cắm vào web

**Chạy ở máy** — tạo file `.env.local`:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcxyz.apps.googleusercontent.com
```

**Trên Vercel** — vào project → **Settings → Environment Variables** → thêm biến
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` với cùng giá trị, rồi **deploy lại** (biến
`NEXT_PUBLIC_*` được nhúng lúc build nên phải build lại mới ăn).

---

## Dùng như thế nào

1. Vào **Dashboard → Đơn hàng**, lọc/tìm hoặc tick chọn các đơn cần xuất.
2. Bấm **Xuất Excel → Lưu vào Google Drive**.
3. Lần đầu Google hiện cửa sổ xin quyền → chọn tài khoản → **Cho phép**.
4. File được lưu vào thư mục **“Doran King — Xuất dữ liệu”** trong Drive, kèm link
   mở ngay.

Nút xuất theo đúng cái đang nhìn thấy:

- Có tick chọn dòng → xuất **đúng những dòng đã tick**.
- Không tick → xuất **toàn bộ kết quả đang lọc** (mọi trang, không chỉ trang hiện tại).

File Excel gồm 2 sheet: **Đơn hàng** (chi tiết từng kiện) và **Tổng hợp** (số kiện
theo kho, theo trạng thái, tỉ giá quy đổi và bộ lọc đã dùng lúc xuất).

---

## Lỗi hay gặp

| Báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Chưa nối Google Drive…` | Thiếu biến môi trường | Thêm `NEXT_PUBLIC_GOOGLE_CLIENT_ID` rồi build lại |
| `Cửa sổ Google bị chặn` | Trình duyệt chặn popup | Cho phép popup cho tên miền này |
| `Google Drive lỗi 403` | Chưa bật Drive API, hoặc email chưa nằm trong Test users | Bật Drive API / thêm email vào Test users |
| Cửa sổ Google báo sai origin | Tên miền chưa khai báo | Thêm đúng origin vào Authorized JavaScript origins |
