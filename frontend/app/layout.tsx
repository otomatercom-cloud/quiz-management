import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Otomater Quizzes", template: "%s · Otomater Quizzes" },
  description: "Register for scholarship quizzes, take timed assessments and view your results.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#155EEF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
