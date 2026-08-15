import { NextResponse, type NextRequest } from "next/server";
import { isProductStoreConfigured, uploadProductImage } from "@/lib/products/productStore";

// Nhận ảnh sản phẩm rồi đẩy lên Supabase Storage, trả về URL công khai.
// Middleware đã chặn ai chưa đăng nhập (/api/dashboard/*).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isProductStoreConfigured())
    return NextResponse.json(
      {
        ok: false,
        error:
          "Chưa nối cơ sở dữ liệu nên chưa lưu ảnh được. Xem docs/supabase.md để cắm biến môi trường.",
      },
      { status: 503 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Không đọc được file gửi lên." }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length)
    return NextResponse.json({ ok: false, error: "Chưa chọn ảnh nào." }, { status: 400 });
  if (files.length > 4)
    return NextResponse.json({ ok: false, error: "Tối đa 4 ảnh mỗi lần." }, { status: 400 });

  try {
    const urls: string[] = [];
    for (const f of files) {
      urls.push(
        await uploadProductImage({ bytes: await f.arrayBuffer(), type: f.type, name: f.name }),
      );
    }
    return NextResponse.json({ ok: true, urls });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Không tải được ảnh lên.";
    console.error("IMAGE_UPLOAD_FAILED", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
