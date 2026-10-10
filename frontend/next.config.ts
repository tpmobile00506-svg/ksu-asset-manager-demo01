import type { NextConfig } from "next";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Load the documented root .env without overriding deployment environment variables.
// Keep dotenv in the build/server config, outside the bundled route modules.
config({ path: path.join(repoRoot, '.env'), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  serverExternalPackages: ['sharp'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // กล้องใช้สแกน QR จึงอนุญาตเฉพาะเว็บนี้ ส่วนไมโครโฟนและตำแหน่งปิด
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
  },
};

export default nextConfig;
