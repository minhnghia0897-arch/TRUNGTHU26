import { NextResponse, type NextRequest } from "next/server";
import {
  createProduct,
  isProductStoreConfigured,
  updateProduct,
  type ProductKind,
  type ProductPatch,
} from "@/lib/products/productStore";

// Sửa danh mục sản phẩm. Middleware đã chặn ai chưa đăng nhập (/api/dashboard/*).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notConfigured = () =>
  NextResponse.json(
    {
      ok: false,
      error:
        "Chưa nối cơ sở dữ liệu nên không lưu được sản phẩm. Xem docs/supabase.md để cắm biến môi trường.",
    },
    { status: 503 },
  );

/** PATCH — sửa một sản phẩm đã có. */
export async function PATCH(req: NextRequest) {
  if (!isProductStoreConfigured()) return notConfigured();

  let body: { key?: string; patch?: ProductPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!body.key)
    return NextResponse.json({ ok: false, error: "Thiếu khoá sản phẩm." }, { status: 400 });

  try {
    const r = await updateProduct(body.key, body.patch ?? {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không lưu được sản phẩm.";
    console.error("PRODUCT_UPDATE_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

/** POST — tạo sản phẩm mới (Hộp / Vị / Combo). */
export async function POST(req: NextRequest) {
  if (!isProductStoreConfigured()) return notConfigured();

  let body: { kind?: ProductKind; patch?: ProductPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (body.kind !== "box" && body.kind !== "flavor" && body.kind !== "combo")
    return NextResponse.json({ ok: false, error: "Loại sản phẩm không hợp lệ." }, { status: 400 });

  try {
    const r = await createProduct(body.kind, body.patch ?? {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không tạo được sản phẩm.";
    console.error("PRODUCT_CREATE_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
