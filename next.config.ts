import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production builds from overwriting a running development server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
