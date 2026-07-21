import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packages that ship native binaries or otherwise can't be bundled by webpack.
  // Used at runtime by src/lib/library-section/* for server-side TSX/Tailwind
  // compilation of library sections.
  serverExternalPackages: [
    "@babel/standalone",
    "@tailwindcss/postcss",
    "@tailwindcss/oxide",
    "@tailwindcss/node",
    "lightningcss",
    "postcss",
    // Native binaries — used server-side to optimise uploaded images
    // (src/lib/images/optimize-image.ts). Must not be bundled by webpack.
    "sharp",
  ],
};

export default nextConfig;
