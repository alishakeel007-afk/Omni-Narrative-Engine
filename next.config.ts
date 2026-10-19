import type { NextConfig } from "next";
import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  outputFileTracingIncludes: { "/*": ["./certs/prod-ca-2021.crt"] },
};

export default (phase: string): NextConfig => ({
  ...nextConfig,
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
});
