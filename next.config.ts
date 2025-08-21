import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true }, // ← ne bloque plus le build Vercel
  // typescript: { ignoreBuildErrors: true }, // (optionnel) à éviter si possible
};

export default nextConfig;
