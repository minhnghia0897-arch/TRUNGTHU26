import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, verifySession } from "@/lib/auth";

// Chặn bảng điều hành và API đơn hàng. Trang bán hàng cho khách không bị đụng.
export const config = {
  matcher: ["/dashboard/:path*", "/api/dashboard/:path*"],
};

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

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
