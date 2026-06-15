import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingExcludes: {
    "*": ["public/img/**"],
  },
};

export default nextConfig;
