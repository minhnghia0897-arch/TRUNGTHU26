import type { Config } from "tailwindcss";

// Design tokens — CLAUDE.md §3
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        maroon: "#5A1620",
        "maroon-deep": "#3B0E15",
        cream: "#F7EFE1",
        gold: "#C6A24C",
        ink: "#2B1A16",
        line: "#E7DAC3",
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        body: ["var(--font-lora)", "Georgia", "serif"],
      },
      borderRadius: {
        // Radius nhỏ 4px — sang, không bo tròn kiểu app
        DEFAULT: "4px",
        sm: "2px",
      },
      maxWidth: {
        app: "468px", // container mobile-first ~460–480px
      },
      letterSpacing: {
        heritage: "0.08em",
        wide2: "0.14em",
      },
    },
  },
  plugins: [],
};

export default config;
