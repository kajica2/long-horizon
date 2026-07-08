import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that should NOT be bundled by Next.js.
  // ffmpeg-installer does platform detection at runtime and uses native
  // binaries; trying to bundle it breaks the build.
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "essentia.js",
  ],
};

export default nextConfig;