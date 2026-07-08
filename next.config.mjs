/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We run a custom server (server/index.ts) that also hosts the Express API,
  // so no rewrites are needed — /api/* is handled before Next's request handler.
};

export default nextConfig;
