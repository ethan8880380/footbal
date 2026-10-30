import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@libsql/client", "libsql"],
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  images: {
    remotePatterns: [new URL("https://sleepercdn.com/content/nfl/players/thumb/**")],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
