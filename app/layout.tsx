import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import NavProgress from "@/components/NavProgress";
import { ToastProvider } from "@/components/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa",
  description: "Oda biriani hadi Alhamisi, tunakuletea Ijumaa mchana.",
};
export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the glass bars respect the phone's safe areas
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sw">
      <body className="antialiased">
        <ToastProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
