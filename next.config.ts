import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": ["public/img/**"],
  },
  // pdfkit (used to render invoice/waybill PDFs for outgoing emails) loads
  // these Cyrillic-capable TTFs from disk at runtime via a literal path —
  // make sure Vercel's serverless bundler actually includes them.
  outputFileTracingIncludes: {
    "/api/orders/**/*": ["lib/fonts/**"],
  },
};

export default nextConfig;
