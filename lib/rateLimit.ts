// ============================================================================
// Đếm lượt gọi theo khoá (IP, SĐT…) trong cửa sổ trượt — chặn dò tự động thô.
//
// Bộ đếm nằm trong bộ nhớ tiến trình. Trên Vercel mỗi instance đếm riêng nên
// đây là hàng rào thấp; muốn chắc tuyệt đối thì cần bộ đếm dùng chung (Redis).
// Dùng chung cho các API công khai: tra cứu, quản lý đơn, sửa đơn.
// ============================================================================
import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function tooMany(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  // dọn định kỳ để Map không phình mãi
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > max;
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";
