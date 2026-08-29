import { NextResponse, type NextRequest } from "next/server";
import { updateManagedParcel, type ManageEdit } from "@/lib/orders/manage";
import { tooMany, clientIp } from "@/lib/rateLimit";

// Người đặt sửa một kiện của chính mình — máy chủ kiểm quyền (SĐT người đặt)
// và kiểm khoá trạng thái; giao diện có giấu nút hay không cũng không qua được.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { phone?: string; shipmentId?: string; edit?: ManageEdit };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const phone = String(body.phone ?? "").trim();
  const shipmentId = String(body.shipmentId ?? "").trim();
  if (phone.length < 6 || !shipmentId || !body.edit)
    return NextResponse.json({ ok: false, error: "Thiếu thông tin." }, { status: 400 });

  if (tooMany(`uip:${clientIp(req)}`, 20))
    return NextResponse.json(
      { ok: false, error: "Anh/chị thao tác hơi nhanh, đợi một phút rồi thử lại giúp em." },
      { status: 429 },
    );

  try {
    const result = await updateManagedParcel(phone, shipmentId, body.edit);
    if (!result.ok) return NextResponse.json(result, { status: result.locked ? 409 : 400 });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không sửa được.";
    console.error("MANAGE_UPDATE_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
