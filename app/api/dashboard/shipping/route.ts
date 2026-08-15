import { NextResponse, type NextRequest } from "next/server";
import { updateShippingFees, type ShippingFeePatch } from "@/lib/products/shipping";
import { isProductStoreConfigured } from "@/lib/products/productStore";
import type { Region } from "@/lib/types";

// Sửa phí vận chuyển theo kho. Middleware đã chặn ai chưa đăng nhập
// (/api/dashboard/*), giống các route quản trị khác.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGIONS: Region[] = ["vn", "kr"];

export async function PATCH(req: NextRequest) {
  if (!isProductStoreConfigured())
    return NextResponse.json(
      { ok: false, error: "Chưa nối cơ sở dữ liệu nên không lưu được phí ship." },
      { status: 503 },
    );

  let body: { region?: Region; patch?: ShippingFeePatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!body.region || !REGIONS.includes(body.region))
    return NextResponse.json({ ok: false, error: "Thiếu kho hoặc kho không hợp lệ." }, { status: 400 });

  try {
    const r = await updateShippingFees(body.region, body.patch ?? {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Không lưu được phí ship." },
      { status: 500 },
    );
  }
}
