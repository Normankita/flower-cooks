/**
 * Web manifest for the cook's "Admin" app. Installing from /admin gives a separate home-screen icon whose
 * start page is /admin, so the cook never has to type the address. Contains nothing secret (login still needs the PIN).
 */
export function GET() {
  const brand = process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa";
  const icon = (size: number, extra = "", purpose: "any" | "maskable" = "any") => ({
    src: `/pwa-icon?size=${size}&admin=1${extra}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  });
  const manifest = {
    id: "/admin",
    name: `${brand} · Admin`,
    short_name: "Jiko Admin",
    description: "Usimamizi wa oda za biriani.",
    lang: "sw",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    background_color: "#140f0b",
    theme_color: "#c2410c",
    icons: [icon(192), icon(512), icon(192, "&maskable=1", "maskable"), icon(512, "&maskable=1", "maskable")],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
