import { NextResponse, type NextRequest } from "next/server";
import { findOrdersByPhone, isLookupConfigured } from "@/lib/orders/lookup";

// Tra cứu đơn theo SĐT — công khai, KHÔNG qua middleware đăng nhập.
// Vì công khai nên phải chặn dò danh bạ: giới hạn số lần gọi theo IP và theo SĐT.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_PER_IP = 12; // một người tra vài số là bình thường
const MAX_PER_PHONE = 5; // cùng một số bị tra dồn dập → gần như chắc chắn là dò

// Bộ đếm trong bộ nhớ. Trên Vercel mỗi instance đếm riêng nên đây là hàng rào
// thấp, chỉ để chặn dò tự động thô. Muốn chắc thì cần bộ đếm dùng chung.
const hits = new Map<string, number[]>();

function tooMany(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  // dọn định kỳ để Map không phình mãi
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > max;
}

const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

export async function POST(req: NextRequest) {
  let phone = "";
  try {
    phone = String(((await req.json()) as { phone?: string }).phone ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (phone.length < 6)
    return NextResponse.json({ ok: false, error: "Nhập số điện thoại đã đặt hàng." }, { status: 400 });

  if (tooMany(`ip:${clientIp(req)}`, MAX_PER_IP) || tooMany(`phone:${phone}`, MAX_PER_PHONE))
    return NextResponse.json(
      { ok: false, error: "Anh/chị tra hơi nhanh, đợi một phút rồi thử lại giúp em." },
      { status: 429 },
    );

  if (!isLookupConfigured())
    return NextResponse.json({ ok: true, configured: false, orders: [] });

  try {
    const orders = await findOrdersByPhone(phone);
    return NextResponse.json({ ok: true, configured: true, orders });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không tra cứu được.";
    console.error("LOOKUP_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
