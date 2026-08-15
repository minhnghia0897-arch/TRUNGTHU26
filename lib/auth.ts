// ============================================================================
// Khoá bảng điều hành bằng một mật khẩu duy nhất.
//
// Dùng Web Crypto (có ở cả Edge middleware lẫn Node) nên middleware kiểm được
// phiên đăng nhập mà không cần gọi vào database.
//
// Phiên = chuỗi "hạn.chữ_ký", chữ ký HMAC-SHA256 bằng chính mật khẩu. Không lưu
// mật khẩu trong cookie, và sửa mật khẩu là mọi phiên cũ hết hiệu lực ngay.
// ============================================================================

export const SESSION_COOKIE = "dk_session";
const SESSION_DAYS = 14;

const secret = () => process.env.DASHBOARD_PASSWORD ?? "";

/** Có đặt mật khẩu hay chưa. Chưa đặt = chế độ mở, chỉ dùng khi chạy máy nhà. */
export const isAuthEnabled = () => secret().length > 0;

/**
 * Đã nối database thật hay chưa.
 *
 * Đọc thẳng biến môi trường thay vì mượn `isServiceRoleConfigured` ở
 * lib/supabase/server.ts, vì middleware chạy trên Edge — kéo cả thư viện
 * Supabase vào đó là thừa và dễ vỡ.
 *
 * Dùng để quyết định: chưa đặt mật khẩu thì cho vào (dữ liệu mẫu, chạy máy
 * nhà) hay khoá cứng (dữ liệu thật, không được để hở).
 */
export const isLiveDataConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer) => {
  let s = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

/** So sánh không phụ thuộc thời gian, tránh rò rỉ qua đo thời gian phản hồi. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = Date.now() + maxAge * 1000;
  return { value: `${exp}.${await sign(String(exp))}`, maxAge };
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await sign(exp));
}

/** Mật khẩu người dùng nhập có đúng không. */
export function checkPassword(input: string): boolean {
  const s = secret();
  if (!s) return false;
  return safeEqual(input, s);
}
