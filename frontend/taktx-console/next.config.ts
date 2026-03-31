import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Disable React Strict Mode to prevent double-firing of useEffect in development.
  // Strict Mode intentionally mounts→unmounts→remounts every component in dev,
  // causing every useEffect (including API fetches) to run twice.
  // This does NOT affect production behaviour.
  reactStrictMode: false,
};

export default nextConfig;
