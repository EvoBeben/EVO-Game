/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; it must stay outside the server bundle.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
