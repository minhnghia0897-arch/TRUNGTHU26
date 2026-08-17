import { NextResponse, type NextRequest } from "next/server";
import { getBankQrVn, setBankQrVn } from "@/lib/products/bankQr";
import { isProductStoreConfigured } from "@/lib/products/productStore";

// Ảnh mã QR ngân hàng VN hiện ở trang thanh toán.
// Middleware đã chặn ai chưa đăng nhập (/api/dashboard/*).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, url: await getBankQrVn() });
}

export async function POST(req: NextRequest) {
  if (!isProductStoreConfigured())
    return NextResponse.json(
      { ok: false, error: "Chưa nối cơ sở dữ liệu nên không lưu được mã QR." },
      { status: 503 },
    );

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  try {
    // Chuỗi rỗng = gỡ ảnh, quay lại QR tự sinh. Hợp lệ, không phải lỗi.
    await setBankQrVn(body.url ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Không lưu được mã QR." },
      { status: 500 },
    );
  }
}
