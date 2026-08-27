import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "100.66.68.20",          // your machine's Tailscale IP
  ],
};

export default nextConfig;
