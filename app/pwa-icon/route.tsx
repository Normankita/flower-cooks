import { ImageResponse } from "next/og";
import { brandIconSvg, svgDataUri } from "@/lib/brand-icon";

/** PNG icons for the web manifest: /pwa-icon?size=192|512[&maskable=1] */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = q.get("size") === "512" ? 512 : 192;
  const maskable = q.has("maskable");
  const svg = brandIconSvg({ size, rounded: !maskable, safe: maskable });
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUri(svg)} width={size} height={size} alt="" />
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
