# Đưa đơn khách đặt về thẳng Google Sheet + Dashboard

Khách bấm đặt hàng → máy chủ ghi ngay một dòng cho mỗi kiện vào Google Sheet trong
Drive của anh → bảng điều hành đọc lại từ chính Sheet đó. Không phải tải file, không
phải thao tác tay, mở máy nào cũng thấy cùng một dữ liệu.

## Vì sao phải làm ở máy chủ

Nút **Xuất Excel → Lưu vào Google Drive** (xem `google-drive.md`) xin quyền Google **của
người đang mở trình duyệt**. Lúc khách đặt hàng thì người đang mở trình duyệt là **khách**
— không thể bắt khách đăng nhập Google để ghi vào Drive của anh.

Nên việc ghi phải chạy ở máy chủ, bằng một **service account**: một tài khoản máy có key
riêng, không phải người. Anh chia sẻ file Sheet cho nó y như chia sẻ cho một đồng nghiệp.

---

## Phần 1 — Tạo service account (~5 phút, làm một lần)

1. Vào <https://console.cloud.google.com/> → tạo project (đặt tên gì cũng được, ví dụ `doran-king`).
2. **APIs & Services → Library** → tìm **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**
   - Đặt tên, ví dụ `doran-king-bot` → **Create and continue** → **Done**.
4. Bấm vào service account vừa tạo → tab **Keys** → **Add key → Create new key → JSON** →
   file JSON tự tải về máy.
5. Mở file JSON đó, lấy 2 trường:
   - `"client_email"` → dạng `doran-king-bot@doran-king.iam.gserviceaccount.com`
   - `"private_key"` → khối dài bắt đầu bằng `-----BEGIN PRIVATE KEY-----`

> File JSON này là **chìa khoá**. Đừng gửi qua chat công khai, đừng commit vào repo.

## Phần 2 — Tạo Sheet và chia sẻ

1. Tạo một Google Sheet mới (trên Drive của anh, hoặc để em tạo giúp).
2. Bấm **Chia sẻ**, dán **`client_email`** ở trên vào, chọn quyền **Người chỉnh sửa (Editor)**
   → **Gửi**.
3. Lấy **ID của Sheet** từ thanh địa chỉ:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...XyZ`**`/edit` → phần in đậm.

> Bước chia sẻ là bước hay bị quên nhất. Service account **không có dung lượng Drive riêng**
> nên nó không tự tạo được file — bắt buộc anh phải tạo file rồi chia sẻ cho nó.

Hai tab `Đơn hàng` và `Lịch sử` sẽ **tự được tạo kèm dòng tiêu đề** ngay lần ghi đầu tiên.

## Phần 3 — Cắm biến môi trường

Trên Vercel: **Settings → Environment Variables**, thêm 4 biến rồi **deploy lại**.

| Biến | Giá trị |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` trong file JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` trong file JSON, dán **nguyên khối** kể cả 2 dòng BEGIN/END |
| `GOOGLE_SHEET_ID` | ID lấy ở Phần 2 |
| `DASHBOARD_PASSWORD` | Mật khẩu anh tự đặt để vào bảng điều hành |

Chạy ở máy nhà thì tạo file `.env.local` với cùng 4 biến.

**Về `GOOGLE_PRIVATE_KEY`:** key có nhiều dòng. Dán thẳng cả khối vào ô của Vercel là được;
code tự xử lý cả trường hợp xuống dòng bị biến thành ký tự `\n`. Nếu key sai định dạng,
bảng điều hành sẽ báo đúng câu *"GOOGLE_PRIVATE_KEY không hợp lệ"* chứ không im lặng.

---

## Cách hệ thống cư xử

| Tình huống | Kết quả |
|---|---|
| **Chưa cắm biến nào** | Bảng điều hành chạy đơn mẫu, có dải chữ xám "Chế độ xem thử". Đơn khách đặt **không** được lưu. |
| **Có `GOOGLE_*` nhưng thiếu `DASHBOARD_PASSWORD`** | API trả lỗi 503, **không** phục vụ dữ liệu khách. Cố ý như vậy: chưa khoá cửa thì không bày hàng ra. |
| **Đủ biến, Sheet lỗi** (sai key, quên chia sẻ, sai ID) | Dải đỏ báo đúng nguyên nhân, bảng trống. **Không bao giờ** hiện đơn mẫu thay thế — nếu không anh sẽ tưởng hôm nay không có khách nào đặt. |
| **Đủ biến, chạy tốt** | Đơn khách đặt hiện trong vài giây, ở cả dashboard lẫn Sheet. |
| **Sheet chết đúng lúc khách đặt** | Khách **vẫn đặt được** (không chặn ở màn thanh toán). Đơn ghi nguyên nội dung vào log Vercel với nhãn `ORDER_SHEET_FAILED` để khôi phục. |

## Cấu trúc Sheet

**Tab `Đơn hàng`** — mỗi dòng là **một kiện** (một người nhận, một kho, một vận đơn). Đơn tặng
3 người sinh 3 dòng, nối với nhau bằng cột **Mã đơn**.

Vài cột đáng chú ý:

- **Khoá** — định danh do máy sinh. **Đừng sửa cột này**, mọi thao tác sửa đơn bám vào nó.
- **Kho** và **Tiền tệ** là **hai cột khác nhau**. Người đặt ở Hàn tặng quà về Việt Nam thì
  Kho = `vn` nhưng Tiền tệ vẫn là `krw`. Trộn hai thứ này là nguồn gốc tính sai doanh thu.
- **Tỉ giá** — chốt tại thời điểm tạo đơn, để sau này tính lại vẫn ra đúng số cũ.
- **Huỷ** — xoá đơn ở dashboard là đánh dấu `TRUE` ở đây chứ không xoá dòng, để còn đối soát.

Anh **sửa tay trong Sheet được**, và **thêm cột riêng ở phía sau cũng được** — code đọc theo
**tên cột** chứ không theo vị trí. Chỉ hai việc không nên làm: đổi tên hoặc xoá các cột
`Khoá`, `Mã đơn`, `Trạng thái`, `Kho`, `Tiền tệ`. Thiếu là hệ thống báo lỗi chứ không đoán mò.

**Tab `Lịch sử`** — ghi lại ai sửa gì lúc nào, chỉ thêm chứ không sửa.

---

## Điều còn hạn chế, cần nói trước

**Tồn kho chưa tự trừ theo đơn web.** Số tồn kho vẫn nằm trong trình duyệt của từng máy.
Trước đây việc trừ kho chạy trên máy **khách**, nghĩa là nó chưa bao giờ về tới anh — nay
cũng vậy. Cột **Tiêu hao** trên Sheet đã ghi sẵn định mức từng đơn để lần sau đưa việc trừ
kho về máy chủ. Đến lúc đó, **đừng tin số tồn kho trên dashboard** cho đơn đặt từ web.

**Trang Tra cứu đơn** (khách tự tra theo SĐT) vẫn đọc dữ liệu trên máy khách, nên khách đổi
máy là không tra được. Sẽ nối vào Sheet sau.

**Trang Tổng quan** vẫn đang hiển thị số liệu mẫu. Ba trang Đơn hàng / Khách hàng / Thu chi
đã dùng dữ liệu thật.
