import { ImageResponse } from "next/og";
import { brandIconSvg, svgDataUri } from "@/lib/brand-icon";

/** PNG icons for the web manifests: /pwa-icon?size=180|192|512[&maskable=1][&admin=1] (admin = lock badge) */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const n = Number(q.get("size"));
  const size = n === 180 || n === 512 ? n : 192;
  const maskable = q.has("maskable");
  const svg = brandIconSvg({ size, rounded: !maskable && size !== 180, safe: maskable, badge: q.has("admin") });
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUri(svg)} width={size} height={size} alt="" />
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
