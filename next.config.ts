import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    turbopackFileSystemCacheForDev: true,
    optimizePackageImports: ["lucide-react", "motion", "gsap"],
  },
};

export default nextConfig;
