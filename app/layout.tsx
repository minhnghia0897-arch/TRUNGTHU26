import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import TrackVisit from "@/components/TrackVisit";

// Font §refresh — Be Vietnam Pro, subset vietnamese, tải thông minh (display swap).
const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-be",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Doran King — Bánh Trung Thu thủ công",
  description: "Bánh Trung Thu thủ công, hộp quà biếu tinh tế. Giao VN & Hàn Quốc.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        {children}
        {/* Đếm khách vào web (§0023). Không vẽ gì ra màn hình, tự bỏ qua khu quản trị. */}
        <TrackVisit />
      </body>
    </html>
  );
}
