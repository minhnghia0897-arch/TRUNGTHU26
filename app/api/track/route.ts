import { NextResponse, type NextRequest } from "next/server";
import { recordVisit } from "@/lib/analytics/pageViews";

// Ghi một lượt khách vào web (§0023). Route CÔNG KHAI — trang bán hàng gọi, khách
// chưa đăng nhập bao giờ. Middleware chỉ chắn /dashboard và /api/dashboard nên
// route này không dính.
//
// LUÔN trả 200, kể cả khi ghi hỏng: trình duyệt khách không có việc gì phải biết
// số liệu nội bộ của shop lỗi hay không, và một lỗi ở đây không được phép hiện
// thành lỗi đỏ trong console của khách.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Sau proxy của Vercel, IP thật nằm ở x-forwarded-for (phần tử ĐẦU là khách,
  // các phần tử sau là chuỗi proxy). Không có thì coi như một khách vô danh —
  // vẫn đếm, chỉ là gộp chung với các khách vô danh khác.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  await recordVisit(ip, ua);
  return NextResponse.json({ ok: true });
}
