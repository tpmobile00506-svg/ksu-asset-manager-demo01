// ตรวจคุณภาพโค้ด: npm run lint (ใช้กฎมาตรฐานของ Next.js + TypeScript)
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // แอป Next.js อยู่ในโฟลเดอร์ frontend/
    settings: { next: { rootDir: 'frontend/' } },
  },
  globalIgnores([
    'node_modules/**',
    'frontend/.next/**',
    'backend/generated/**',
    'backend/.cache/**',
    'backend/data/**',
    'graphify-out/**',
    'scratch/**',
    'docs/**',
    'next-env.d.ts',
  ]),
]);
