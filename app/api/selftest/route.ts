import { NextResponse } from "next/server";
import {
  COLUMNS,
  buildHeaderMap,
  displayTime,
  idFromKey,
  newRowKey,
  orderToCells,
  rowToOrder,
  type SheetOrder,
} from "@/lib/orders/orderSchema";
import { listOrders, isOrderStoreConfigured } from "@/lib/orders/orderStore";

// TẠM THỜI — route tự kiểm tra phần ánh xạ cột. Xoá sau khi kiểm xong.
export const dynamic = "force-dynamic";

export async function GET() {
  const out: string[] = [];
  const fail: string[] = [];
  const check = (name: string, cond: boolean, got?: unknown) => {
    if (cond) out.push(`✓ ${name}`);
    else fail.push(`✗ ${name}${got === undefined ? "" : ` — nhận: ${JSON.stringify(got)}`}`);
  };

  // 1. header map đúng vị trí
  const header = [...COLUMNS];
  const map = buildHeaderMap(header);
  check("Khoá ở cột 0", map["Khoá"] === 0, map["Khoá"]);
  check("Tiền tệ tách khỏi Kho", map["Tiền tệ"] !== map["Kho"]);

  // 2. chèn thêm cột lạ vào GIỮA → vẫn đọc đúng theo tên
  const shifted = ["Ghi chú của anh", ...COLUMNS];
  const map2 = buildHeaderMap(shifted);
  check("chèn cột lạ vẫn map đúng", map2["Khoá"] === 1 && map2["Mã đơn"] === 2, {
    khoa: map2["Khoá"],
    ma: map2["Mã đơn"],
  });

  // 3. thiếu cột bắt buộc → phải ném lỗi, không đoán mò
  let threw = false;
  try {
    buildHeaderMap(COLUMNS.filter((c) => c !== "Khoá"));
  } catch {
    threw = true;
  }
  check("thiếu cột Khoá thì báo lỗi", threw);

  // 4. round-trip: OrderRow → ô → OrderRow
  const sample: SheetOrder = {
    id: 0,
    rowKey: newRowKey("TR-260814-A1B2", 2),
    orderCode: "TR-260814-A1B2",
    parcelIndex: 2,
    parcelCount: 3,
    transferCode: "TRX9K2",
    source: "web",
    status: "Đang đóng hàng",
    region: "vn",
    currency: "vnd",
    fx: 18.5,
    customer: "Nguyễn Thị Hoài",
    phone: "0982576263",
    recipient: "Mẹ",
    recipientPhone: "0326678509",
    address: "Q. Cầu Giấy, Hà Nội — ngõ 5, số 12",
    carrier: "GHN",
    vc: "GHN-55021",
    product: "Hộp gấm 6 vị ×2, Trà xanh",
    expected: "2026-09-20",
    prepaid: 960000,
    cod: 0,
    cuoc_vc: 30000,
    phi_vc_thu_khach: 0,
    tags: ["Web", "Quà DN"],
    note: 'Gói riêng "quà biếu"',
    assignee: "Web",
    consume: { "vo-gam": 1, "b-thapcam": 2 },
    stockApplied: true,
    created: "",
    createdAtIso: "2026-08-14T06:30:00.000Z",
    updatedAtIso: "2026-08-14T06:30:00.000Z",
    voided: false,
  };

  const cells = orderToCells(map, sample, COLUMNS.length);
  const back = rowToOrder(map, cells);
  check("round-trip không mất dòng", back !== null);
  if (back) {
    check("SĐT giữ nguyên số 0 đầu", back.phone === "0982576263", back.phone);
    check("SĐT người nhận không mất", back.recipientPhone === "0326678509", back.recipientPhone);
    check("tiền tệ đúng", back.currency === "vnd", back.currency);
    check("kho đúng", back.region === "vn", back.region);
    check("tiền đúng kiểu số", back.prepaid === 960000 && typeof back.prepaid === "number", back.prepaid);
    check("nhãn tách đúng", JSON.stringify(back.tags) === '["Web","Quà DN"]', back.tags);
    check("ghi chú giữ dấu nháy", back.note === 'Gói riêng "quà biếu"', back.note);
    check("tiêu hao SKU round-trip", JSON.stringify(back.consume) === '{"vo-gam":1,"b-thapcam":2}', back.consume);
    check("kiện 2/3", back.parcelIndex === 2 && back.parcelCount === 3);
    check("id ổn định theo khoá", back.id === idFromKey(sample.rowKey), back.id);
    check("ngày tạo hiển thị được", /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(back.created ?? ""), back.created);
  }

  // 5. round-trip khi Sheet có cột lạ chèn giữa
  const width2 = shifted.length;
  const cells2 = orderToCells(map2, sample, width2);
  const back2 = rowToOrder(map2, cells2);
  check("round-trip qua sheet có cột lạ", back2?.orderCode === "TR-260814-A1B2", back2?.orderCode);
  check("cột lạ không bị ghi đè", cells2[0] === "", cells2[0]);

  // 6. dòng rác / thiếu khoá → bỏ qua, không làm sập
  check("dòng trống bị bỏ qua", rowToOrder(map, []) === null);
  check("JSON tiêu hao hỏng không làm sập", (() => {
    const bad = [...cells];
    bad[map["Tiêu hao"]!] = "{hỏng";
    return rowToOrder(map, bad)?.consume === undefined;
  })());

  // 7. id khác nhau cho khoá khác nhau
  check("id không đụng nhau", idFromKey("TR-1-1") !== idFromKey("TR-1-2"));

  // 8. displayTime chịu được rác
  check("displayTime không nổ", displayTime("không phải ngày") === "không phải ngày");

  // 9. chưa cấu hình → trả dữ liệu mẫu, KHÔNG lỗi
  const listed = await listOrders();
  check("chưa cấu hình thì source = seed", isOrderStoreConfigured() || listed.source === "seed", listed.source);
  check("seed có đủ đơn mẫu", listed.rows.length > 0, listed.rows.length);

  return NextResponse.json(
    { ok: fail.length === 0, passed: out.length, failed: fail.length, fail, out },
    { status: fail.length ? 500 : 200 },
  );
}
