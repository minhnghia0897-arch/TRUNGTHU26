import { NextRequest, NextResponse } from "next/server";
import { createOrder, type CreateOrderInput, type OrderParcel } from "@/lib/orders/createOrder";
import {
  appendOrders,
  isOrderStoreConfigured,
  orderCodeExists,
  type NewParcel,
} from "@/lib/orders/orderStore";
import { currencyOf } from "@/lib/money";
import { getFxRate } from "@/lib/catalog";
import type { Region } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/orders — tạo đơn (validate + snapshot giá/fx server-side),
// rồi ghi thẳng vào Google Sheet để đơn về tới cửa hàng ngay.

/** Dựng dòng Sheet từ một kiện. Tiền giữ nguyên tiền tệ người đặt. */
function toParcelRow(
  p: OrderParcel,
  i: number,
  total: number,
  ctx: {
    code: string;
    transferCode: string;
    buyerName: string;
    buyerPhone: string;
    buyerRegion: Region;
    fx: number;
    fromMessenger: boolean;
  },
): NewParcel {
  return {
    orderCode: ctx.code,
    parcelIndex: i + 1,
    parcelCount: total,
    transferCode: ctx.transferCode,
    source: ctx.fromMessenger ? "facebook" : "web",
    status: "Mới",
    region: p.region, // kho xuất
    currency: currencyOf(ctx.buyerRegion), // tiền của người đặt
    fx: ctx.fx,
    customer: ctx.buyerName,
    phone: ctx.buyerPhone,
    recipient: p.recipientName || ctx.buyerName,
    recipientPhone: p.recipientPhone,
    address: p.address,
    carrier: "",
    vc: "",
    product: p.items,
    expected: p.desiredDate,
    prepaid: p.total,
    cod: 0,
    cuoc_vc: 0,
    phi_vc_thu_khach: 0,
    tags: [ctx.fromMessenger ? "Messenger" : "Web"],
    note: p.note?.trim() ?? "",
    assignee: "Web",
    consume: p.consume,
    stockApplied: false,
  };
}

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

  // --- ghi vào Google Sheet ---
  // Đơn đã chốt giá xong rồi. Nếu Sheet lỗi thì VẪN trả đơn thành công cho
  // khách (không chặn khách ở màn thanh toán), nhưng gắn synced=false và ghi
  // nguyên nội dung ra log để cứu lại được.
  let synced = false;
  if (isOrderStoreConfigured()) {
    const order = result.order;
    const fx = await getFxRate();
    const rows = order.shipments.map((p, i) =>
      toParcelRow(p, i, order.shipments.length, {
        code: order.code,
        transferCode: order.transferCode,
        buyerName: body.buyer.name.trim(),
        buyerPhone: body.buyer.phone.trim(),
        buyerRegion: body.buyer.region,
        fx,
        fromMessenger: Boolean(body.buyer.refToken),
      }),
    );

    try {
      // Khách bấm hai lần → đơn cùng mã, bỏ qua lần sau.
      if (await orderCodeExists(order.code)) {
        synced = true;
      } else {
        await appendOrders(rows);
        synced = true;
      }
    } catch (e) {
      console.error(
        "ORDER_SHEET_FAILED",
        e instanceof Error ? e.message : e,
        JSON.stringify(rows),
      );
    }
  }

  return NextResponse.json({ ...result, order: { ...result.order, synced } }, { status: 200 });
}
