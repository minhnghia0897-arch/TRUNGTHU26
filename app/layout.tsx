import type { Metadata } from "next";
import { Playfair_Display, Lora } from "next/font/google";
import "./globals.css";

// Fonts §3 — subset vietnamese
const playfair = Playfair_Display({
  subsets: ["vietnamese", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});
const lora = Lora({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-lora",
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
    <html lang="vi" className={`${playfair.variable} ${lora.variable}`}>
      <body>
        <div className="mx-auto min-h-screen max-w-app bg-cream shadow-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
