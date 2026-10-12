import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.SHUMOS_BUILD_DIR || ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
