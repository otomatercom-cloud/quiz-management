import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#155EEF", dark: "#12336A", light: "#EFF6FF" },
        navy: "#12336A",
        page: "#F8FAFC",
        ink: "#101828",
        muted: "#667085",
        ok: "#039855",
        warn: "#DC6803",
        bad: "#D92D20",
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)" },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
export default config;
