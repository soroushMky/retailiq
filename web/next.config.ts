import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forward /api/... to the FastAPI server running on this same computer
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },

  // Allow other devices on the home network (phone, laptop) to use the dev server
  allowedDevOrigins: ["10.0.0.*", "192.168.*.*"],
};

export default nextConfig;