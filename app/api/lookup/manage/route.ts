import { NextResponse, type NextRequest } from "next/server";
import { findManagedOrders } from "@/lib/orders/manage";
import { tooMany, clientIp } from "@/lib/rateLimit";

// Bảng đơn cho người đặt nhiều đơn (KOL/đại lý) — công khai, chìa khoá là SĐT
// người đặt nên rate-limit như trang tra cứu.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let phone = "";
  try {
    phone = String(((await req.json()) as { phone?: string }).phone ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (phone.length < 6)
    return NextResponse.json({ ok: false, error: "Nhập số điện thoại đã đặt hàng." }, { status: 400 });

  if (tooMany(`mip:${clientIp(req)}`, 12) || tooMany(`mphone:${phone}`, 5))
    return NextResponse.json(
      { ok: false, error: "Anh/chị tra hơi nhanh, đợi một phút rồi thử lại giúp em." },
      { status: 429 },
    );

  try {
    const result = await findManagedOrders(phone);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không tra cứu được.";
    console.error("MANAGE_LOOKUP_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
