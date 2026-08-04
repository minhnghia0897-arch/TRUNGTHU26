import type { Config } from "tailwindcss";

// Design tokens — refresh 2026: kem + gold + navy (giữ tên token cũ để toàn app đổi tông).
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "maroon" giờ là navy sâu — màu dark chủ đạo (header, badge, chữ tiêu đề)
        maroon: "#1C2B45",
        "maroon-deep": "#14203A",
        navy: "#1C2B45",
        cream: "#F4EEE2",
        "cream-soft": "#FBF7EF",
        gold: "#C6A24C",
        "gold-deep": "#A9822B",
        ink: "#2B2620",
        line: "#E7DCC6",
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
        card: "0 6px 20px -8px rgba(28,43,69,0.18)",
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
