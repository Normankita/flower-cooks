import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page here reads live data per request, so we use classic dynamic rendering
  // (route-level `dynamic = "force-dynamic"`) instead of Cache Components.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
