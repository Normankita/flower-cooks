import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home Screen" / Install app) with the bowl icon and our colours.
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa";
  return {
    id: "/",
    name,
    short_name: name.length > 14 ? name.slice(0, 14).trim() : name,
    description: "Oda biriani hadi Alhamisi, tunakuletea Ijumaa mchana.",
    lang: "sw",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff6ea",
    theme_color: "#c2410c",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=192&maskable=1", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
