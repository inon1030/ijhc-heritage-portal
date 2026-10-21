import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/files/*': ['./assets/fonts/Heebo.ttf', './assets/fonts/OFL.txt'],
  },
};

export default nextConfig;
