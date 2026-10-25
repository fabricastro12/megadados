import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // postgres.js runs only in route handlers; keep it out of the bundle.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
