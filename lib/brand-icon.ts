/**
 * The app's bowl-of-biriani artwork as SVG (kept in sync with app/icon.svg).
 * rounded: rounded-square (browser/"any" icons). safe: extra padding so Android's circular/squircle mask never crops it.
 */
export function brandIconSvg({ size = 64, rounded = true, safe = false } = {}): string {
  const v = safe ? "-8 -8 80 80" : "0 0 64 64";
  const bg = safe
    ? `<rect x="-8" y="-8" width="80" height="80" fill="url(#g)"/>`
    : `<rect width="64" height="64" ${rounded ? 'rx="15" ' : ""}fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v}" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fb923c"/><stop offset=".55" stop-color="#ea580c"/><stop offset="1" stop-color="#b91c1c"/>
  </linearGradient></defs>
  ${bg}
  <path d="M24 21c-3-3 3-5 0-8M32 20c-3-3 3-5 0-9M40 21c-3-3 3-5 0-8" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M14 36c2-9 10-13 18-13s16 4 18 13z" fill="#fde68a"/>
  <circle cx="25" cy="31" r="2" fill="#c2410c"/><circle cx="34" cy="29" r="2" fill="#dc2626"/><circle cx="40" cy="33" r="1.8" fill="#c2410c"/>
  <path d="M10 36h44c0 11-9 18-22 18S10 47 10 36z" fill="#fff"/>
</svg>`;
}

/** data: URI to use as <img src> inside next/og ImageResponse. */
export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
