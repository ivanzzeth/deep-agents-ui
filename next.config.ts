import type { NextConfig } from "next";

// Served behind nginx at /deepagents/. basePath rewrites all routes and
// asset URLs so HMR + page navigation work transparently through the proxy.
// In dev, set NEXT_PUBLIC_BASE_PATH="" if you want to access the dev server
// directly at http://localhost:3000/ (bypassing nginx).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/deepagents";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
};

export default nextConfig;
