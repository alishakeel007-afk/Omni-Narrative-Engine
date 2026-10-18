import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production builds from overwriting a running development server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // The Windows environment used for local production verification denies
    // Next's separate webpack compiler process (`spawn EPERM`). Keeping the
    // compiler in this process changes build execution only, not runtime
    // application behavior.
    webpackBuildWorker: false,
  },
};

export default nextConfig;
