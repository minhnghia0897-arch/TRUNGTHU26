import type { Region } from "./types";

// Chuẩn hoá SĐT về E.164 (§4.2). VN +84, KR +82. Bỏ số 0 đầu vùng.
export function normalizePhone(raw: string, region: Region): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) return digits;

  const cc = region === "vn" ? "84" : "82";
  let local = digits;
  if (local.startsWith("00")) return "+" + local.slice(2);
  if (local.startsWith(cc)) return "+" + local;
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length < 8) return null;
  return "+" + cc + local;
}
