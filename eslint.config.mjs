// ตรวจคุณภาพโค้ด: npm run lint (ใช้กฎมาตรฐานของ Next.js + TypeScript)
// ต้องไม่มี error ก่อน commit · warning คือหนี้ทางเทคนิคที่ยังทยอยแก้ (ดู docs/ARCHITECTURE.md หัวข้อ "สิ่งที่ยังค้าง")
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // แอป Next.js อยู่ในโฟลเดอร์ frontend/
    settings: { next: { rootDir: 'frontend/' } },
    rules: {
      // ตัวแปรที่ตั้งใจไม่ใช้ให้ขึ้นต้นด้วย _ เช่น const { password: _password, ...rest } = input
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // หนี้ที่ยังทยอยแก้: any ~50 จุดในโค้ดแอป และ setState ใน useEffect ~25 จุด (ทำงานถูก แต่ไม่ใช่แบบที่ React แนะนำ)
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // เทสต์ใช้ข้อมูลจำลองที่ไม่ครบทุกช่อง จึงอนุญาต any
    files: ['backend/tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
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
