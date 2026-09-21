import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "export",
  turbopack: {
    root: process.cwd(),
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
