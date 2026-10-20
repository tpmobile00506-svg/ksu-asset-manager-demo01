// เปิดเซิร์ฟเวอร์พัฒนาพร้อมโหมดดูการทำงานหลังบ้าน: npm run dev:trace (เล่าแบบอ่านง่าย) หรือ npm run dev:trace:full (แสดง SQL เต็ม)
// ตั้ง DEBUG_TRACE ให้ Next.js โดยตรง จึงใช้ได้ทั้ง Windows, macOS และ Linux โดยไม่ต้องลง cross-env
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
const level = process.argv[2] === 'full' ? '2' : '1';
console.log(`\n[หลังบ้าน] โหมดดูการทำงานหลังบ้านเปิดอยู่ (DEBUG_TRACE=${level}) · เปิดเว็บที่ http://127.0.0.1:3000 แล้วดูข้อความในหน้าต่างนี้\n`);
const child = spawn(process.execPath, [next, 'dev', 'frontend', '--hostname', '127.0.0.1', '--port', '3000'], {
  stdio: 'inherit',
  env: { ...process.env, DEBUG_TRACE: level },
});
child.on('exit', code => process.exit(code ?? 0));
