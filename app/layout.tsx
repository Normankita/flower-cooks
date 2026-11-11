import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import NavProgress from "@/components/NavProgress";
import { ToastProvider } from "@/components/Toaster";
import "./globals.css";

const brand = process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa";
const description = "Oda biriani hadi Alhamisi, tunakuletea Ijumaa mchana.";

// Absolute base URL so link-preview images get full URLs (WhatsApp ignores relative og:image).
function siteUrl(): URL | undefined {
  try {
    return new URL((process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/^["']+|["']+$/g, ""));
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: brand,
  description,
  applicationName: brand,
  appleWebApp: { capable: true, title: brand, statusBarStyle: "default" },
  openGraph: { title: brand, description, siteName: brand, type: "website", locale: "sw_TZ" },
  twitter: { card: "summary_large_image", title: brand, description },
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
