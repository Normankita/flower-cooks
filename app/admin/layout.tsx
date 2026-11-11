import type { Metadata } from "next";

// Everything under /admin (login + panel): installable as its own "Admin" app, and kept out of search engines.
export const metadata: Metadata = {
  manifest: "/api/admin-manifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Jiko Admin", statusBarStyle: "default" },
  icons: { apple: [{ url: "/pwa-icon?size=180&admin=1", sizes: "180x180", type: "image/png" }] },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
