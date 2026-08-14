import { NextResponse, type NextRequest } from "next/server";
import {
  appendOrders,
  isOrderStoreConfigured,
  listOrders,
  updateOrder,
  voidOrders,
  type NewParcel,
} from "@/lib/orders/orderStore";
import type { SheetOrder } from "@/lib/orders/orderSchema";
import { isAuthEnabled } from "@/lib/auth";

// Đọc/ghi đơn cho bảng điều hành. Middleware đã chặn ai chưa đăng nhập.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chốt an toàn: đã nối Sheet thật mà chưa đặt mật khẩu thì KHÔNG phục vụ dữ liệu.
 * Không có chốt này, quên đặt DASHBOARD_PASSWORD là công khai tên, SĐT, địa chỉ
 * của toàn bộ khách cho bất kỳ ai biết đường dẫn.
 */
function guard(): NextResponse | null {
  if (isOrderStoreConfigured() && !isAuthEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Chưa đặt DASHBOARD_PASSWORD trên máy chủ. Vì bảo mật, dữ liệu đơn thật " +
          "không được trả về khi bảng điều hành chưa khoá.",
      },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;

  try {
    const data = await listOrders();
    return NextResponse.json({ ok: true, configured: isOrderStoreConfigured(), ...data });
  } catch (e) {
    // Đã cấu hình mà lỗi → báo lỗi thật. Tuyệt đối không lặng lẽ trả đơn mẫu.
    const message = e instanceof Error ? e.message : "Không đọc được Google Sheet.";
    console.error("SHEET_LIST_FAILED", message);
    return NextResponse.json({ ok: false, configured: true, error: message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  let body: { rowKey?: string; patch?: Partial<SheetOrder>; changes?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!body.rowKey)
    return NextResponse.json({ ok: false, error: "Thiếu khoá đơn." }, { status: 400 });

  try {
    const r = await updateOrder(body.rowKey, body.patch ?? {}, "Bạn", body.changes ?? []);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không ghi được Google Sheet.";
    console.error("SHEET_UPDATE_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  let parcels: NewParcel[];
  try {
    parcels = ((await req.json()) as { parcels?: NewParcel[] }).parcels ?? [];
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!parcels.length)
    return NextResponse.json({ ok: false, error: "Không có đơn để tạo." }, { status: 400 });

  try {
    const r = await appendOrders(parcels);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không ghi được Google Sheet.";
    console.error("SHEET_CREATE_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  let rowKeys: string[];
  try {
    rowKeys = ((await req.json()) as { rowKeys?: string[] }).rowKeys ?? [];
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  try {
    const r = await voidOrders(rowKeys);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không ghi được Google Sheet.";
    console.error("SHEET_VOID_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
