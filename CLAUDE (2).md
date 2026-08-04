# CLAUDE.md — Trăng Rằm · Web bán bánh Trung Thu (bản đầy đủ)

Spec để build website bán lẻ + tích hợp Pancake. Đọc hết file này trước khi code.
Ba nguyên tắc gốc, không được vi phạm ở bất kỳ màn hình nào:

1. **Mobile-first, một cột**, thẩm mỹ heritage Việt cao cấp.
2. **Hai trục vùng, độc lập nhau** — vùng NGƯỜI ĐẶT quyết tiền tệ + bảng giá; vùng NGƯỜI NHẬN quyết kho xuất + phí ship. Không trộn.
3. **Web = mặt tiền, Pancake = hậu trường.** Web lo cấu hình + thương hiệu + tạo đơn; đẩy đơn sang Pancake để nó lo ship + tracking + CSKH. Không xây lại ops.

---

## 1. Mục tiêu & phạm vi

Website đặt bánh Trung Thu cho khách lẻ, có 3 lối vào giỏ dùng chung một hệ component:
- **Hộp tự chọn** (chủ đạo): chọn vỏ hộp → lấp từng ô bằng vị → 1 dòng giỏ/hộp.
- **Combo / set gợi ý sẵn**: hộp đã mix sẵn, thêm một chạm.
- **Mua lẻ bánh**: từng vị, tăng/giảm số lượng.

Bán trên 2 vùng: `vn` và `kr`. Một khách có thể đặt **nhiều đơn**, mỗi đơn tặng **nhiều người nhận ở các vùng khác nhau**, và theo dõi tiến độ giao **từng kiện riêng**.

---

## 2. Nguyên lý xương sống — hai trục vùng

| Trục | Bám vào | Quyết định |
|------|---------|-----------|
| Vùng thanh toán | NGƯỜI ĐẶT | Tiền tệ (VND/KRW) + bảng giá SP + STK nhận CK |
| Vùng giao hàng | NGƯỜI NHẬN (từng người) | Kho xuất + phí ship + phương thức + đơn Pancake nào |

Hệ quả: **một đơn web nhiều người nhận = nhiều kiện = nhiều đơn Pancake** (mỗi đơn Pancake chỉ ôm 1 địa chỉ + 1 vận đơn), nhưng khách chỉ **thanh toán một lần, một bill, một tiền tệ**, rồi theo dõi từng kiện tách ra.

---

## 3. Design language (tóm tắt)

Chi tiết token + component xem file mockup `trang-ram-mobile.html`. Cốt lõi:
- Màu: `--maroon #5A1620`, `--maroon-deep #3B0E15`, `--cream #F7EFE1`, `--gold #C6A24C`, `--ink #2B1A16`, `--line #E7DAC3`. Radius nhỏ 4px (sang, không bo tròn kiểu app).
- Font: **Playfair Display** (tiêu đề, chữ hoa giãn chữ 0.06–0.14em) + **Lora** (body), subset `vietnamese`.
- Layout: hotline bar → header logo giữa → hero nền đỏ tối → khối bán → editorial + hoa văn gold → specs. Sentence case cho câu; UPPERCASE chỉ cho tiêu đề SP + nút.
- KHÔNG sao chép logo/ảnh/chữ của brand tham chiếu (Tinh Hoa Bắc Bộ). Chỉ mượn ngôn ngữ thiết kế; xây bản sắc riêng.

---

## 4. Data model (Supabase / Postgres)

Data-driven hoàn toàn. Money trên `web_order` luôn ở **tiền tệ người đặt**. Mọi số tiền lưu ở **đơn vị nhỏ nhất, kiểu integer** (VND: đồng; KRW: won — không có phần thập phân) để tránh sai số float.

### 4.1 Sơ đồ bảng

```
warehouse        { id, region(vn|kr), name,
                   shipping_mode(separate|included),   -- included = gộp ship vào giá, fee=0
                   fee_table(jsonb), local_currency(vnd|krw), active }

box              { id, name, weight(150|60), slots, price_vn, price_kr,
                   allowed_flavor_weight, specs(jsonb), active }
flavor           { id, name, weight(150|60), premium(bool),
                   premium_surcharge_vn, premium_surcharge_kr,      -- phụ thu khi nằm trong hộp
                   price_vn, price_kr, sort, active }               -- price_* = giá mua lẻ
combo            { id, name, box_id, flavor_ids(jsonb), active }

app_config       { key, value(jsonb), updated_at }                  -- fx_rate, STK, ngưỡng tồn…

customer         { id, name, phone(normalized, unique), region(vn|kr),  -- region người đặt
                   pancake_customer_id, pancake_shop, created_at }

web_order        { id, code(unique, ngắn – dùng cho tra cứu/CK), customer_id, buyer_region(vn|kr),
                   currency(vnd|krw), fx_rate_snapshot(numeric),    -- tỉ giá chốt lúc tạo đơn
                   subtotal, shipping_total, handling_total, grand_total,
                   payment_status(pending|paid|canceled|refunded),
                   fulfillment_status(draft|pending_payment|paid|pushing|pushed|partially_pushed|push_failed|canceled),
                   transfer_code(unique), paid_at, canceled_at, created_at }

recipient        { id, web_order_id, name, phone, address,
                   region(vn|kr), desired_date }                    -- vùng giao = quyết kho; desired_date = ngày muốn nhận

order_line       { id, web_order_id, recipient_id,                  -- dòng này giao cho AI
                   kind(box|combo|la), box_id?, combo_id?, flavors(jsonb)?, qty,
                   unit_price, line_total,                          -- money ở currency người đặt (đã snapshot)
                   price_source(jsonb) }                            -- snapshot giá gốc để đối soát

shipment         { id, web_order_id, recipient_id,
                   fulfillment_region(vn|kr), warehouse_id,
                   shipping_fee, handling_fee, shipping_mode,
                   push_status(pending|pushed|failed), push_attempts(int), idempotency_key(unique),
                   pancake_order_id, vc_code,                       -- vc_code = mã vận chuyển (VC) từ ĐVVC
                   carrier, tracking_status,                        -- tracking_status theo pipeline Pancake (§10.5)
                   cod, prepaid, cuoc_vc, phi_vc_thu_khach,         -- tài chính đơn khớp Pancake
                   tags(jsonb), note, source(web|facebook|pos) }

order_links      { token(unique), page_id, psid, pancake_customer_id, pancake_shop, used, created_at }
webhook_event    { id, provider, external_id(unique), payload(jsonb), processed_at }  -- idempotent inbox
```

Đơn web mặc định `source='web'`, `prepaid=grand_total của kiện`, `cod=0` (đã CK trước).

### 4.2 Quan hệ & ràng buộc

- `web_order 1—N recipient`, `recipient 1—1 shipment`, `order_line N—1 recipient`. Mỗi `shipment` map tới đúng **1 đơn Pancake**.
- `shipment.idempotency_key` **UNIQUE** → tạo lại đơn Pancake nhiều lần vẫn ra một đơn (chống đẩy trùng, §10.2).
- `webhook_event.external_id` **UNIQUE** → webhook Pancake bắn lặp cũng chỉ xử lý một lần.
- `customer.phone` chuẩn hoá E.164 trước khi lưu/so khớp (VN `+84`, KR `+82`); unique theo số đã chuẩn hoá.
- Mọi cột tiền là `bigint`, `>= 0`. `fx_rate_snapshot` là `numeric` (không làm tròn khi lưu).

### 4.3 RLS (bắt buộc)

- **Bảng danh mục** (`warehouse`, `box`, `flavor`, `combo`, `app_config`): client chỉ `SELECT` bản ghi `active=true`; ghi chỉ qua service role.
- **Bảng đơn** (`web_order`, `recipient`, `order_line`, `shipment`): **client không truy cập trực tiếp**. Mọi đọc/ghi đơn đi qua **API route/Edge Function dùng service role** — vì không có auth khách, không thể ràng buộc RLS theo `user_id`. Tra cứu công khai (§10.4) đi qua endpoint riêng có rate-limit, không mở RLS toàn bảng.

---

## 5. Logic giá & tiền tệ

- **Tiền tệ = vùng người đặt.** Đặt ở Hàn → KRW; đặt ở VN → VND. Toàn bộ số tiền hiển thị + bill + mã CK theo tiền tệ này. Không đổi giữa chừng trong một đơn.
- **Bảng giá SP = vùng người đặt.** Dùng `price_vn` hoặc `price_kr` theo `buyer_region`, kể cả khi tặng chéo vùng. Một đơn = một bảng giá, gọn cho khách.
- **Hai bảng giá độc lập, cấu hình tay:** giá KR là mốc; **giá VN thấp hơn KR ~10–20%** (vd cùng set: đặt ở Hàn ~50.000 KRW ⇄ đặt ở VN tương đương ~40.000). Không suy giá bằng công thức — điền hai bảng riêng để linh hoạt. Thị trường chính: **người đặt phần lớn ở Hàn.**
- **Giá hộp tự chọn** = giá phẳng theo size hộp (theo bảng giá vùng người đặt) `+ Σ phụ thu vị premium` (`flavor.premium_surcharge_[region]`). KHÔNG cộng giá mua lẻ từng bánh.
- **Combo** tính như hộp tự chọn với vị cố định. **Mua lẻ** = `flavor.price[buyer_region] × qty`.
- **Snapshot giá khi tạo đơn:** `order_line.unit_price/line_total` + `price_source` chốt tại thời điểm tạo đơn. Đổi bảng giá sau đó **không** ảnh hưởng đơn cũ.
- **Ca chéo vùng #4** (người đặt VN trả giá VN thấp nhưng giao từ kho Hàn chi phí cao): bù bằng **`handling_fee`** (phí handling giao-tại-Hàn, cấu hình ở `warehouse.fee_table.handling`), **không bẻ giá SP**. `handling_fee` cộng vào `handling_total`. Ca này hiếm (thị trường chính ở Hàn) nên chấp nhận được.
- Làm tròn khi **hiển thị**: VND `toLocaleString('vi-VN')+'đ'`, KRW `'₩'+toLocaleString('en-US')`. Tính toán luôn trên integer đơn vị nhỏ nhất.

---

## 6. Logic phí ship & kho (cấu hình)

- **Kho bám vùng người nhận.** `recipient.region == vn` → kho VN, giao nội địa VN. `== kr` → kho Hàn, giao nội địa Hàn. Không ship bánh vượt biên.
- **Phí ship cấu hình theo kho** (`warehouse.shipping_mode`):
  - `separate` → tính phí theo `fee_table` của kho đó (kho VN: giá ship VN; kho Hàn: giá ship Hàn).
  - `included` → ship đã gộp trong giá bán → `shipping_fee = 0` (hiển thị "đã gồm ship"). Dùng khi bảng giá vùng đó đã cộng ship sẵn.
- **Ca chéo vùng** (tiền tệ người đặt ≠ tiền tệ kho): phí ship của kho ở tiền tệ local → **quy đổi về tiền tệ người đặt theo `fx_rate_snapshot` đã chốt trên `web_order`** (không đọc tỉ giá live lúc render lại). `fx_rate` gốc lưu ở `app_config.fx_rate(krw↔vnd)`; đơn snapshot lúc tạo.
- `shipping_total = Σ shipping_fee (đã quy đổi về currency người đặt)`; `handling_total = Σ handling_fee`.

---

## 7. Đa người nhận / chia quà

- Một `web_order` chứa 1..N `recipient`. Mỗi recipient: tên, SĐT, địa chỉ, vùng.
- Ở checkout, khách **gán mỗi `order_line` cho đúng một recipient** ("hộp này gửi ai"). Từ đó hệ thống dựng `shipment` theo từng recipient.
- `grand_total = subtotal + shipping_total + handling_total`, tất cả ở tiền tệ người đặt. Một bill, một mã CK, dù nhiều kiện nhiều vùng.
- **Ràng buộc dựng shipment:** mỗi recipient sinh đúng 1 shipment; kho = kho `active` của `recipient.region`; nếu vùng không có kho active → chặn checkout, báo lỗi rõ.

---

## 8. Luồng checkout (mobile, các bước)

1. **Giỏ** — dòng hàng (box/combo/lẻ) + qty, giá theo vùng người đặt.
2. **Người đặt** — tên, SĐT, vùng (lấy từ token Messenger nếu có, hoặc region selector) → set tiền tệ.
3. **Người nhận** — thêm 1..N người; mỗi người: tên, SĐT, địa chỉ, vùng, **ngày muốn nhận** (`desired_date`). Gán dòng hàng → người nhận (chia quà).
4. **Xem lại** — bill theo tiền tệ người đặt, tách phí ship + handling từng kiện, ghi rõ kiện nào đi kho nào.
5. **Thanh toán** — hiện STK theo tiền tệ + mã CK duy nhất.
6. **Xác nhận** → đẩy Pancake → chuyển sang trang theo dõi.

### 8.1 Validate server-side khi tạo đơn (chốt trước khi ra bill)

Tạo đơn là một **transaction**; nếu bất kỳ mục nào fail → rollback, không tạo đơn nửa vời:
- **Hộp tự chọn:** số vị lấp = `box.slots`; mọi `flavor.weight == box.allowed_flavor_weight`; mọi flavor/box `active=true`.
- **Combo:** `flavor_ids` khớp cấu hình combo, tất cả `active`.
- **Mua lẻ / qty:** `qty >= 1`, item `active`.
- **Recheck còn bán:** re-load giá + `active` từ DB (không tin giá client gửi lên) → dựng `unit_price/line_total` server-side.
- **Vùng có kho:** mỗi `recipient.region` phải có kho `active`.
- **SĐT:** người đặt bắt buộc; chuẩn hoá E.164.
- Chốt `fx_rate_snapshot` + snapshot giá tại đây.

Giỏ và trạng thái đơn giữ ở server/Supabase, **KHÔNG localStorage** ở production (localStorage chỉ dùng làm cache tạm UI, không phải nguồn chân lý).

---

## 9. Thanh toán (chuyển khoản) & bill

- Mặc định **chuyển khoản (CK) đối soát bằng mã**: mỗi `web_order` sinh một `transfer_code` duy nhất, khách ghi vào nội dung CK.
- STK nhận tiền theo tiền tệ: tài khoản VN cho VND, tài khoản Hàn cho KRW (config ở `app_config` theo `currency`).
- **Màn thanh toán phải có: mã QR + các dòng copy được.** Mỗi trường (số TK, số tiền, nội dung CK) có nút Copy (`navigator.clipboard`). QR:
  - VND → **VietQR** (napas 247, quét được bằng mọi app ngân hàng VN): dựng theo chuẩn VietQR với số tiền + nội dung = `transfer_code`.
  - KRW → QR chuyển khoản ngân hàng Hàn / Toss (hoặc QR mã hoá thông tin CK). Cấu hình theo `currency`.
- **Đối soát:** mặc định tay — nhân viên đánh dấu `payment_status = paid`, set `paid_at`. Để ngỏ nối cổng/parse SMS ngân hàng tự động sau; khi tự động, khớp bằng `transfer_code` + số tiền.
- Chuyển `pending → paid` là **điều kiện kích hoạt đẩy Pancake** (§10.2). Chỉ chuyển tiến; không cho `paid → pending`. Hoàn tiền dùng `canceled/refunded` (§9.1).
- Bill hiển thị: dòng hàng + phí ship + handling từng kiện + tổng, một tiền tệ.

### 9.1 Hủy / hoàn

- `web_order.payment_status`: `pending → canceled` (chưa trả, hủy tự do) hoặc `paid → refunded` (đã trả, hoàn tiền tay).
- Khi hủy đơn đã đẩy Pancake: **không xóa đơn Pancake tự động** — đánh dấu `fulfillment_status=canceled`, tạo task nhắc nhân viên hủy phía Pancake (giữ một nguồn chân lý, tránh web tự ý sửa ops).

---

## 10. Tích hợp Pancake POS

### 10.1 Gắn định danh khách (khách nào)
- Bảng `order_links { token, page_id, psid, pancake_customer_id, pancake_shop, used }`.
- Khi anh gửi link đặt hàng trong Messenger, gửi URL kèm `?ref=<token>`; token map tới `pancake_customer_id` của hội thoại (đọc qua Pancake Chat API / Botcake quick-reply).
- Web đọc `ref`, cõng qua giỏ; khi tạo đơn, backend gắn `pancake_customer_id` → đơn về đúng khách, hiện trong hội thoại.
- Khách tự vào web (không token): match theo SĐT (Pancake dedupe khách theo SĐT, 1 khách nhiều SĐT). **Luôn bắt buộc SĐT ở checkout.**

### 10.2 Đẩy đơn — 1 web_order → N đơn POS (idempotent)
- Kích hoạt khi `payment_status = paid` (`fulfillment_status: paid → pushing`).
- Với **mỗi `shipment`**: tạo 1 đơn POS ở **kho/shop khớp `fulfillment_region`** (kho VN hoặc kho Hàn), gồm: địa chỉ recipient, các `order_line` của recipient đó, `shipping_fee`, note `"web #<order.code> · kiện <i>/<N>"`, và gắn `pancake_customer_id` người đặt.
- **Idempotency:** mỗi shipment có `idempotency_key` cố định; gửi kèm khi tạo đơn Pancake. Đẩy lại (retry/chạy trùng) không sinh đơn mới — kiểm `shipment.pancake_order_id` đã có thì bỏ qua.
- **Retry có backoff** khi lỗi mạng/API; đếm `push_attempts`. Đẩy từng shipment độc lập: một kiện fail không chặn kiện khác.
- **Tổng kết trạng thái:** tất cả pushed → `pushed`; một phần → `partially_pushed` (hiện cảnh báo ở dashboard để đẩy nốt tay); không cái nào → `push_failed`.
- Kết quả: N đơn Pancake cùng thuộc một khách → anh nhìn ra cùng một người đặt.

### 10.3 Shop/kho — đã xác nhận từ Pancake thực tế
- **Mô hình: MỘT shop Pancake, NHIỀU kho** (giao diện "Tất cả các kho"). Một danh sách đơn chứa cả địa chỉ VN lẫn Hàn, vận hành bằng ₩. → chọn **kho** theo `fulfillment_region` khi tạo đơn; không tách hai shop.
- Vì một shop → **`customer_id` thống nhất**, binding khách chạy tốt cho mọi vùng (không còn lo cross-shop).
- **Vẫn cần kiểm ở `developer.pancake.biz`:** API tạo đơn POS nhận trực tiếp `customer_id` để bind hay chỉ dedupe theo SĐT. Nếu chỉ theo SĐT → đảm bảo SĐT đã có trong hồ sơ khách + ghi `customer_id` vào note để đối soát.

### 10.4 Theo dõi
- Mỗi đơn POS có `pancake_order_id`; POS webhook bắn trạng thái + vận đơn về Supabase, cập nhật `shipment.tracking_status/carrier/vc_code`.
- **Webhook phải verify + idempotent:** kiểm chữ ký/secret của Pancake trước khi xử lý; ghi `webhook_event.external_id` unique để bỏ qua bản lặp; chỉ cho phép chuyển trạng thái tiến theo pipeline (§10.5), bỏ qua event trễ/nghịch.
- Trang theo dõi gom **N shipment dưới một `web_order`**, hiện tiến độ từng kiện riêng (kèm `desired_date` ngày muốn nhận + vận đơn). Một khách xem được nhiều `web_order`, mỗi cái nhiều kiện.
- Đẩy `desired_date` của từng recipient xuống đơn Pancake tương ứng (ghi chú/ngày hẹn giao) để kho gói và giao đúng hạn.
- **Tra cứu đơn bằng SĐT đã đặt, không cần đăng nhập:** nhập số điện thoại → match `customer.phone` → trả về mọi `web_order` của khách đó cùng tiến độ từng kiện. Đây là cổng theo dõi chính cho khách lẻ.
  - **Bảo mật:** endpoint tra cứu có **rate-limit theo IP + SĐT** (chống dò danh bạ); chỉ trả trường cần cho theo dõi (che bớt địa chỉ đầy đủ nếu cần); tra sâu 1 đơn cần thêm `web_order.code`. Không mở RLS đọc bảng đơn cho client.

### 10.5 Cấu trúc đơn Pancake (đối chiếu danh sách đơn thực tế)
Web đẩy đơn phải điền đúng các trường Pancake dùng, và tracking phải map đúng pipeline trạng thái của Pancake.

- **Nguồn đơn:** `facebook` (từ hội thoại) · `web` (từ website này) · `pos` (bán tại quầy). Đơn web nên gắn nhãn nguồn riêng để lọc.
- **Trường đơn:** `Mã đơn (ID)` · `Mã vận chuyển (VC)` · `Thẻ/tag` · `Ghi chú` · `Khách hàng` (người đặt) · `Tên người nhận` · `SĐT` (+ nhà mạng) · `Địa chỉ nhận` · `Kho` · `ĐVVC` (Viettel/GHN/GHTK/CJ…) · `Trạng thái`.
- **Tài chính đơn:** `COD` (thu hộ) · `Trả trước` · `Cước VC` (phí ship thực trả ĐVVC) · `Phí VC thu khách` (ship thu của khách) · tổng. Đơn web mặc định **Trả trước** (đã CK), COD = 0.
- **Pipeline trạng thái (map webhook → `shipment.tracking_status`):**
  `Mới → Chờ hàng → Đã xác nhận → Đang đóng hàng → Chờ chuyển hàng → Đã gửi hàng → Đã nhận → Đã thu tiền`.
  Trang theo dõi khách hiển thị đúng các mốc này (không tự chế trạng thái khác).
- **Tìm kiếm đơn** (khớp hành vi Pancake): theo mã đơn / mã vận chuyển / tên / địa chỉ / SĐT / ghi chú.
- **View lọc:** Tất cả · Cần xử lý · Trễ giao; lọc theo kho. Dashboard web nên phản chiếu các lát cắt này.

---

## 11. Bốn tình huống thực tế = acceptance tests

| # | Tình huống | Tiền tệ | Người nhận | Kho + ship | Số đơn POS |
|---|-----------|---------|-----------|-----------|-----------|
| 1 | Đặt Hàn, giao 2-3 nơi ở Hàn | KRW | đều KR | kho Hàn, nội địa | N (mỗi người 1) |
| 2 | Đặt Hàn, vài nơi ở Hàn + vài nơi ở VN | KRW | KR + VN | kiện KR→kho Hàn; kiện VN→kho VN | N, **tách 2 kho** |
| 3 | Đặt Hàn, chỉ giao ở VN | KRW | đều VN | kho VN, nội địa; phí ship VN quy đổi về KRW | N ở nhánh VN |
| 4 | Đặt VN, giao sang Hàn | VND | đều KR | kho Hàn, nội địa; phí ship + handling Hàn quy đổi về VND | N ở nhánh Hàn |

Mọi ca: tiền tệ theo người đặt; kho + phí ship theo người nhận; một bill; theo dõi tách kiện; `fx_rate` snapshot lúc tạo đơn; đẩy Pancake idempotent. Dùng bảng này làm test khi build.

---

## 12. Điều hướng khách đặt thẳng web (giảm phụ thuộc chat)

- **Kéo traffic vào web, không vào inbox:** CTA "Đặt ngay" trỏ web (thay "Nhắn tin"); comment-to-web tự trả link; link in bio; QR trên bao bì/tờ rơi; broadcast khách cũ.
- **Web tự tư vấn thay chat:** set gợi ý ("best-seller/quà biếu/ăn nhà"), mô tả vị, **quiz chọn hộp** (2-3 câu → gợi ý); bảng phí ship + thời gian rõ cho cả 2 vùng; review + hình thật + hạn dùng + hotline.
- **Lưới an toàn:** chat widget ngay trên web (khách hỏi mà không rớt về app); Botcake tự đẩy link web cá nhân hoá + menu nhanh, anh chỉ vào tay khi khách phân vân.
- Đo tỉ lệ chốt web-direct vs chat (lưu `source` + UTM ở `web_order`); sản phẩm chuẩn đẩy web, quà DN cao cấp giữ chat.

---

## 13. Tech stack & config

- **Frontend:** Next.js (App Router) trên Vercel, mobile-first, container ~460–480px.
- **Backend/DB:** Supabase (bảng ở §4, RLS §4.3). Trạng thái đơn + giỏ ở server. Logic tạo đơn/đẩy Pancake/webhook chạy ở **API route / Edge Function dùng service role**.
- **Config cần có (ở `app_config`):** `fx_rate(krw↔vnd)`; STK VN + STK Hàn theo currency; ngưỡng cảnh báo tồn; `warehouse.shipping_mode` + `fee_table` (gồm `handling`) mỗi kho; Pancake Shop ID + API key + webhook secret.
- **Secrets:** API key Pancake, service role key, webhook secret **chỉ để server-side** (env var), không lộ ra client.
- **Fonts:** `next/font` load Playfair Display + Lora subset vietnamese.
- **Tiền tệ/i18n:** format theo `currency`; tách chuỗi để mở rộng ngôn ngữ (ngôn ngữ khách Hàn/Anh để ngỏ, nhưng tách string sẵn từ đầu).

---

## 14. Do / Don't

**Do:** tách 2 trục vùng ngay từ data model; một bill một tiền tệ theo người đặt; kho + ship theo người nhận; 1 web_order → N đơn Pancake; snapshot giá + fx lúc tạo đơn; validate + re-check giá server-side; idempotent khi đẩy đơn và nhận webhook; luôn bắt SĐT; tiền lưu integer đơn vị nhỏ nhất; radius nhỏ + UPPERCASE giãn chữ cho heritage; data-driven mọi thứ.

**Don't:** trộn tiền tệ trong một đơn; ship bánh vượt biên khi đã có kho vùng đó; nhồi giá từng bánh vào builder; nhét vùng vào SKU; tin giá client gửi lên; đẩy đơn Pancake không idempotency (đẩy trùng); xử lý webhook không verify/không chống lặp; localStorage làm nguồn chân lý cho giỏ ở production; lộ service role/API key ra client; sao chép logo/ảnh/chữ brand tham chiếu; hardcode tỉ giá.

---

## 15. Bảng điều hành (dashboard)

Dashboard là **phòng điều hành lớp web**, KHÔNG phải ERP thứ hai. Nguyên tắc: chỉ sở hữu dữ liệu web-native, ĐỌC ops từ Pancake — tránh hai nguồn chân lý.

- **Web-native (dashboard sở hữu):** nhóm đơn theo cùng khách (1 người đặt → N kiện → N đơn Pancake); doanh số hợp nhất chéo vùng + đa tiền tệ (quy về đơn vị đang chọn qua `fx_rate`); ngày muốn nhận + ghi chú ở mức quà/người nhận; **cảnh báo đơn `partially_pushed`/`push_failed` cần đẩy lại**.
- **Đọc từ Pancake (mirror, không giữ):** tồn kho (nguồn chân lý = Pancake, đọc qua API, chỉ hiển thị + cảnh báo dưới ngưỡng); trạng thái vận chuyển + vận đơn (từ webhook).
- **Các bảng:** KPI (doanh số theo range, số đơn, kiện theo vùng VN/Hàn, đang vận chuyển, cảnh báo tồn, đơn lỗi đẩy); doanh số theo ngày (hợp nhất); đơn theo khách (xổ ra từng đơn → từng kiện: người nhận, vùng, ngày giao, vận chuyển + vận đơn, ghi chú, ĐVVC, COD/trả trước, phí VC).
- **Trạng thái kiện dùng đúng pipeline Pancake** (§10.5): Mới → Chờ hàng → Đã xác nhận → Đang đóng hàng → Chờ chuyển hàng → Đã gửi hàng → Đã nhận → Đã thu tiền. Lấy các lát cắt "Cần xử lý / Trễ giao" giống Pancake.
- **Bộ lọc:** khoảng thời gian (hôm nay/7 ngày/tháng), vùng (tất cả/VN/Hàn), tiền tệ hiển thị (₩/đ, quy đổi qua `fx_rate`), tìm theo tên/SĐT/mã đơn.
- **Tuyệt đối không** sửa tồn kho hay tạo/sửa đơn trong dashboard — mọi thay đổi ops đi qua Pancake để giữ một nguồn chân lý. Ngoại lệ duy nhất: **đẩy lại** đơn `push_failed` (retry cùng idempotency_key, không sinh đơn mới).

---

## 16. File kèm
- `trang-ram-mobile.html` — mockup mobile đã áp design language (nguồn tham chiếu token + component).
- `trang-ram-full.html` — mockup luồng đặt hàng đầy đủ (builder, đa người nhận, ngày nhận, QR + copy CK, tra cứu theo SĐT). Khối `DATA` đầu `<script>` để thay dữ liệu thật.
- `trang-ram-dashboard.html` — mockup bảng điều hành (KPI, doanh số/ngày, tồn kho từ Pancake, đơn theo khách xổ ra kiện).

> Lưu ý: hiện repo **chưa chứa** 3 file mockup trên. Cần upload/tạo trước khi coi là nguồn chân lý cho design token & component; nếu không, §3/§16 chỉ mang tính mô tả.
