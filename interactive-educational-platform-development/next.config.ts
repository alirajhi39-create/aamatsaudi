import type { NextConfig } from "next";

const corsOrigin = (process.env.CORS_ORIGIN ?? "").trim() || "*";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Baseline CORS for every API route (route handlers also add dynamic headers + OPTIONS preflight)
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: corsOrigin.split(",")[0].trim() || "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Requested-With, X-Teacher-Pin, If-None-Match, If-Modified-Since, Accept",
          },
          { key: "Access-Control-Expose-Headers", value: "ETag, Content-Length, Content-Type, Last-Modified, Cache-Control" },
        ],
      },
    ];
  },
};

export default nextConfig;
