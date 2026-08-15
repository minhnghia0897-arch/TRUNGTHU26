import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, isLiveDataConfigured, verifySession } from "@/lib/auth";

// Chặn bảng điều hành và API đơn hàng. Trang bán hàng cho khách không bị đụng.
export const config = {
  matcher: ["/dashboard/:path*", "/api/dashboard/:path*"],
};

const LOCKED_MESSAGE =
  "Chưa đặt DASHBOARD_PASSWORD trên máy chủ. Bảng điều hành bị khoá cho tới khi đặt mật khẩu, " +
  "vì để hở là ai cũng xem được đơn khách, sửa giá và tải file lên kho ảnh.";

/**
 * Khoá cứng khi đã nối database thật mà chưa đặt mật khẩu.
 * Trả HTML cho trang, JSON cho API — để màn hình quản trị hiện đúng lỗi.
 */
function locked(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: LOCKED_MESSAGE }, { status: 503 });
  }
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bảng điều hành đang khoá</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#1e293b;line-height:1.6">
<h1 style="font-size:1.25rem;margin-bottom:.75rem">Bảng điều hành đang khoá</h1>
<p>${LOCKED_MESSAGE}</p>
<p style="margin-top:1rem">Cách mở: vào Vercel → Settings → Environment Variables, thêm
<code style="background:#f1f5f9;padding:.15rem .4rem;border-radius:.25rem">DASHBOARD_PASSWORD</code>
cho môi trường Production, rồi Redeploy.</p>
</body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) {
    // Chưa đặt mật khẩu. Hai trường hợp khác hẳn nhau:
    //
    // - Chưa nối database (chạy máy nhà): cho vào, dữ liệu toàn là mẫu, hở cũng
    //   không mất gì. Không bắt lập trình viên đặt mật khẩu mới chạy được.
    // - Đã nối database thật: KHOÁ CỨNG. Thà chủ shop không vào được còn hơn để
    //   cả internet đọc đơn khách, sửa giá hay quăng file vào kho ảnh — trước
    //   đây nhánh này `next()` thẳng nên mọi route /api/dashboard/* đều mở toang.
    if (!isLiveDataConfigured()) return NextResponse.next();
    return locked(req);
  }

  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  // API trả 401 để client biết mà hiện lại màn đăng nhập, không redirect HTML
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  const login = new URL("/dang-nhap", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}
