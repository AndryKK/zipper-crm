import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": ["public/img/**"],
  },
};

export default nextConfig;
