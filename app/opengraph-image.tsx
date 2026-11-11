import { ImageResponse } from "next/og";
import { brandIconSvg, svgDataUri } from "@/lib/brand-icon";

// Link preview card (WhatsApp, Facebook, X, ...): 1200x630.
export const alt = "Oda biriani hadi Alhamisi, tunakuletea Ijumaa mchana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const brand = process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 55%, #fdba74 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#c2410c", letterSpacing: 4, textTransform: "uppercase" }}>
            Oda mtandaoni
          </div>
          <div style={{ fontSize: 88, fontWeight: 800, color: "#7c2d12", lineHeight: 1.05, marginTop: 14 }}>{brand}</div>
          <div style={{ fontSize: 38, color: "#431407", marginTop: 28, lineHeight: 1.3 }}>
            Oda hadi Alhamisi, tunakuletea Ijumaa mchana.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 40,
              alignSelf: "flex-start",
              padding: "16px 34px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #ea580c, #b91c1c)",
              color: "#fff",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            Agiza sasa →
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={svgDataUri(brandIconSvg({ size: 380 }))} width={380} height={380} alt="" />
      </div>
    ),
    { ...size },
  );
}
