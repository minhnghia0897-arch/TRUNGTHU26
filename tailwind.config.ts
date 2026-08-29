import type { Config } from "tailwindcss";

// Design tokens — refresh 2026: tông TikTok Shop (nền trắng, đen than, đỏ hồng).
// GIỮ NGUYÊN TÊN token cũ (navy/gold/cream…) để toàn app đổi tông một lượt —
// đúng cách lần đổi kem-gold-navy đã làm. Bảng màu gốc của TikTok:
//   đen than #161823 · đỏ hồng #FE2C55 · aqua #25F4EE · nền trắng.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "navy"/"maroon" giờ là đen than TikTok — màu dark chủ đạo (header, badge)
        maroon: "#161823",
        "maroon-deep": "#000000",
        navy: "#161823",
        cream: "#FFFFFF",
        "cream-soft": "#F8F8F8",
        // "gold" giờ là đỏ hồng TikTok — màu nhấn/CTA; bản deep để chữ trên nền trắng
        gold: "#FE2C55",
        "gold-deep": "#D9224A",
        ink: "#161823",
        line: "#E3E3E4",
      },
      fontFamily: {
        // toàn bộ dùng Be Vietnam Pro
        serif: ["var(--font-be)", "system-ui", "sans-serif"],
        body: ["var(--font-be)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "3px",
        card: "16px",
      },
      maxWidth: {
        app: "468px",
      },
      letterSpacing: {
        heritage: "0.06em",
        wide2: "0.12em",
      },
      boxShadow: {
        card: "0 6px 20px -8px rgba(22,24,35,0.16)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
