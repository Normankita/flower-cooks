import { ImageResponse } from "next/og";
import { brandIconSvg, svgDataUri } from "@/lib/brand-icon";

// iPhone home-screen icon: full-bleed (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={svgDataUri(brandIconSvg({ size: 180, rounded: false }))} width={180} height={180} alt="" />
    ),
    { ...size },
  );
}
