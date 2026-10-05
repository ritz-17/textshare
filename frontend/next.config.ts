import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a minimal server.js for container images.
  output: "standalone",
  // Hide the Next.js badge shown in development (errors are still reported).
  devIndicators: false,
};

export default nextConfig;
