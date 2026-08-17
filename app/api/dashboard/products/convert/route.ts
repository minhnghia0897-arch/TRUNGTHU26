import { NextResponse, type NextRequest } from "next/server";
import {
  convertProduct,
  isProductStoreConfigured,
  type ProductKind,
} from "@/lib/products/productStore";

// Đổi loại sản phẩm (Hộp ⇄ Combo ⇄ Vị) — dời dòng sang bảng khác.
// Để route riêng thay vì nhét vào PATCH: PATCH là sửa cột của một sản phẩm, còn
// đây là đổi cả danh tính của nó (khoá mới, bảng mới). Trộn hai việc vào một chỗ
// thì chỗ gọi khó biết mình vừa làm gì.
// Middleware đã chặn ai chưa đăng nhập (/api/dashboard/*).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isProductStoreConfigured())
    return NextResponse.json(
      { ok: false, error: "Chưa nối cơ sở dữ liệu nên không đổi được loại sản phẩm." },
      { status: 503 },
    );

  let body: { key?: string; toKind?: ProductKind };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!body.key)
    return NextResponse.json({ ok: false, error: "Thiếu khoá sản phẩm." }, { status: 400 });
  if (body.toKind !== "box" && body.toKind !== "flavor" && body.toKind !== "combo")
    return NextResponse.json({ ok: false, error: "Loại sản phẩm không hợp lệ." }, { status: 400 });

  try {
    const r = await convertProduct(body.key, body.toKind);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không đổi được loại sản phẩm.";
    console.error("PRODUCT_CONVERT_FAILED", message);
    // 409: từ chối vì dữ liệu đang vướng (đã có đơn, đang nằm trong set) — khác
    // hẳn lỗi hệ thống, và chỗ gọi hiện thẳng câu này cho người dùng đọc.
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
