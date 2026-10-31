import type { NextConfig } from "next";

const corsOrigin = (process.env.CORS_ORIGIN ?? "").trim() || "*";

const nextConfig: NextConfig = {
  images: {
    // Serve files from /public directly. The `/_next/image` optimiser is not available on every
    // hosting setup and made the lesson images disappear after deployment.
    unoptimized: true,
  },
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
      {
        // Lesson pictures: cache aggressively (file names are stable)
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
