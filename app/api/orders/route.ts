import { NextRequest, NextResponse } from "next/server";
import { createOrder, type CreateOrderInput } from "@/lib/orders/createOrder";
import { isOrderStoreConfigured } from "@/lib/orders/orderStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/orders — tạo đơn: validate + chốt giá/fx server-side rồi lưu thẳng
// vào Supabase (customer → web_order → recipient → order_line → shipment).
// Từ lúc này đơn đã nằm trong cơ sở dữ liệu, bảng điều hành mở máy nào cũng thấy.
export async function POST(req: NextRequest) {
  let body: CreateOrderInput;
  try {
    body = (await req.json()) as CreateOrderInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Body không hợp lệ." }, { status: 400 });
  }

  const result = await createOrder(body);
  if (!result.ok || !result.order) {
    return NextResponse.json(result, { status: 400 });
  }

  // `simulated` = chưa cấu hình DB nên đơn chỉ tồn tại trong phiên này.
  // Client dựa vào cờ này để nhắc khách gửi đơn qua Messenger cho chắc.
  const synced = isOrderStoreConfigured() && !result.order.simulated;
  return NextResponse.json({ ...result, order: { ...result.order, synced } }, { status: 200 });
}
