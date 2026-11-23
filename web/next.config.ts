import type { NextConfig } from "next";

// Where the FastAPI server lives. Locally: http://127.0.0.1:8000.
// On Vercel: set API_URL in Project Settings > Environment Variables (e.g. https://retailiq-api.onrender.com).
const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // The browser only ever talks to this site; Next.js forwards /api/* to the API (no CORS needed).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  allowedDevOrigins: ["10.0.0.*", "192.168.*.*"],
};

export default nextConfig;
