import { NextRequest, NextResponse } from "next/server";

// Bảo vệ khu điều hành /dashboard bằng Basic Auth.
// Mật khẩu đặt qua env DASHBOARD_PASSWORD (Vercel → Settings → Environment
// Variables). Nếu chưa đặt, dùng mặc định để demo.
const DEFAULT_PASSWORD = "trangram2026";

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD || DEFAULT_PASSWORD;
  const auth = req.headers.get("authorization");

  if (auth?.startsWith("Basic ")) {
    try {
      const [, pw] = atob(auth.slice(6)).split(":");
      if (pw === password) return NextResponse.next();
    } catch {
      /* fallthrough → 401 */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Trang Ram Dashboard"' },
  });
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
