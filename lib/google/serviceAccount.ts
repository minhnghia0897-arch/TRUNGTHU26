import crypto from "node:crypto";

// ============================================================================
// Lấy access token Google bằng SERVICE ACCOUNT (chạy ở server, không cần ai
// đăng nhập). Đây là cách để web tự ghi đơn vào Google Sheet của anh ngay lúc
// khách bấm đặt hàng — khách không phải đăng nhập Google, và cũng không thể.
//
// Luồng chuẩn "JWT bearer" của Google:
//   1. Tự ký một JWT bằng private key của service account.
//   2. Đổi JWT đó lấy access token ở oauth2.googleapis.com/token.
// Không cần thư viện ngoài — dùng crypto có sẵn của Node.
// ============================================================================

const TOKEN_URL = "https://oauth2.googleapis.com/token";

const email = () => process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";

/**
 * Private key dán vào env thường bị escape thành "\n" hai ký tự, và hay bị bọc
 * trong dấu nháy. Chuẩn hoá lại để crypto đọc được.
 */
const privateKey = () => {
  const raw = process.env.GOOGLE_PRIVATE_KEY ?? "";
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
};

export const isServiceAccountConfigured = () => Boolean(email() && privateKey());

const b64url = (input: string | Buffer) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// token dùng lại trong vòng đời của instance server, hết hạn thì tự xin lại
const cache = new Map<string, { token: string; until: number }>();

export async function getServiceToken(scope: string): Promise<string> {
  if (!isServiceAccountConfigured())
    throw new Error(
      "Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY (xem docs/google-sheet.md).",
    );

  const hit = cache.get(scope);
  if (hit && Date.now() < hit.until) return hit.token;

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: email(), scope, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const signingInput = `${header}.${claim}`;

  let signature: string;
  try {
    signature = b64url(
      crypto.createSign("RSA-SHA256").update(signingInput).end().sign(privateKey()),
    );
  } catch {
    throw new Error("GOOGLE_PRIVATE_KEY không hợp lệ — copy nguyên khối BEGIN/END PRIVATE KEY.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token)
    throw new Error(
      `Google từ chối cấp token: ${data.error_description ?? data.error ?? res.status}`,
    );

  // trừ hao 60s cho chắc
  const until = Date.now() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000;
  cache.set(scope, { token: data.access_token, until });
  return data.access_token;
}
