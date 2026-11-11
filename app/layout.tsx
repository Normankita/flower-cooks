import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa",
  description: "Oda biriani hadi Alhamisi, tunakuletea Ijumaa mchana.",
};
export const viewport: Viewport = { themeColor: "#c2410c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sw">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
