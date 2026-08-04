import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

// Font §refresh — Be Vietnam Pro, subset vietnamese, tải thông minh (display swap).
const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-be",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trăng Rằm — Bánh Trung Thu thủ công",
  description: "Bánh Trung Thu thủ công, hộp quà biếu tinh tế. Giao VN & Hàn Quốc.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>{children}</body>
    </html>
  );
}
