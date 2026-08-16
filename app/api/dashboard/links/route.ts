import { NextResponse, type NextRequest } from "next/server";
import { addLink, getFacebookPageId, listLinks, removeLink, setFacebookPageId } from "@/lib/orders/links";
import { isServiceRoleConfigured } from "@/lib/supabase/server";

// Link truy vết khách Messenger. Middleware đã chặn ai chưa đăng nhập
// (/api/dashboard/*), giống các route quản trị khác.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notConfigured = () =>
  NextResponse.json(
    { ok: false, error: "Chưa nối cơ sở dữ liệu nên chưa lưu được link." },
    { status: 503 },
  );

const failed = (e: unknown, fallback: string) =>
  NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : fallback },
    { status: 500 },
  );

export async function GET() {
  if (!isServiceRoleConfigured) return NextResponse.json({ ok: true, links: [] });
  try {
    const [links, pageId] = await Promise.all([listLinks(), getFacebookPageId()]);
    return NextResponse.json({ ok: true, links, pageId });
  } catch (e) {
    return failed(e, "Không đọc được link.");
  }
}

export async function POST(req: NextRequest) {
  if (!isServiceRoleConfigured) return notConfigured();

  let body: {
    customerName?: string;
    psid?: string;
    phone?: string;
    pageId?: string;
    conversationLink?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  // Cùng route cho tiện: gửi mỗi pageId thì là lưu cấu hình Trang.
  if (body.pageId !== undefined && !body.customerName) {
    try {
      await setFacebookPageId(body.pageId);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return failed(e, "Không lưu được Page ID.");
    }
  }

  if (!body.customerName?.trim())
    return NextResponse.json({ ok: false, error: "Thiếu tên khách." }, { status: 400 });

  try {
    return NextResponse.json({ ok: true, link: await addLink(body as { customerName: string }) });
  } catch (e) {
    return failed(e, "Không tạo được link.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!isServiceRoleConfigured) return notConfigured();

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!body.token)
    return NextResponse.json({ ok: false, error: "Thiếu token." }, { status: 400 });

  try {
    await removeLink(body.token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failed(e, "Không xoá được link.");
  }
}
