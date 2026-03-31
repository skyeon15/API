import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    API_NEXT_PUBLIC_API_URL: process.env.API_NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
