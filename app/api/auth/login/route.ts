import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, checkPassword, createSession, isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Chống dò mật khẩu: đếm số lần sai theo IP, khoá tạm khi quá nhiều.
// Bộ nhớ theo instance — đủ để chặn dò tự động, không phải hàng rào tuyệt đối.
const attempts = new Map<string, { n: number; until: number }>();
const MAX_TRIES = 8;
const LOCK_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!isAuthEnabled())
    return NextResponse.json(
      { ok: false, error: "Chưa đặt DASHBOARD_PASSWORD trên máy chủ." },
      { status: 400 },
    );

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rec = attempts.get(ip);
  if (rec && rec.n >= MAX_TRIES && Date.now() < rec.until) {
    const phut = Math.ceil((rec.until - Date.now()) / 60000);
    return NextResponse.json(
      { ok: false, error: `Sai quá nhiều lần. Thử lại sau ${phut} phút.` },
      { status: 429 },
    );
  }

  let password = "";
  try {
    password = String(((await req.json()) as { password?: string }).password ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  if (!checkPassword(password)) {
    const n = (rec && Date.now() < rec.until ? rec.n : 0) + 1;
    attempts.set(ip, { n, until: Date.now() + LOCK_MS });
    return NextResponse.json({ ok: false, error: "Mật khẩu không đúng." }, { status: 401 });
  }

  attempts.delete(ip);
  const { value, maxAge } = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
