import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM packages are loaded from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["better-sqlite3", "@formepdf/core", "@formepdf/react", "unpdf", "mammoth"],
  outputFileTracingIncludes: { "/api/render": ["./public/fonts/**", "./public/acer-logo.png"] },
};

export default nextConfig;
