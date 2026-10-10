import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

// ไฟล์ข้อความต้องเป็น UTF-8 ที่ไม่มี BOM และไม่มีอักขระเพี้ยน (mojibake)
// เกิดเมื่อไฟล์ UTF-8 ถูกอ่านเป็น Windows-874 แล้วบันทึกซ้ำ ทำให้ภาษาไทยอ่านไม่ออกบน GitHub
const root = join(import.meta.dirname, '..', '..');
const skipDirs = new Set(['node_modules', '.next', '.git', '.cache', 'generated', 'data', 'archive', 'graphify-out', 'scratch']);
const textFile = /\.(md|ts|tsx|json|mjs|css|prisma|sql|yml|yaml)$|^\.(gitignore|env\.example|editorconfig)$/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!skipDirs.has(name) && !(dir === root && name === 'docs')) yield* walk(path); }
    else if (textFile.test(name)) yield path;
  }
}

test('ไฟล์ข้อความในโปรเจกต์เป็น UTF-8 ไม่มี BOM และไม่มีอักขระเพี้ยน', () => {
  const problems: string[] = [];
  for (const file of walk(root)) {
    const bytes = readFileSync(file);
    const name = relative(root, file).replaceAll('\\', '/');
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problems.push(`${name}: มี BOM`);
    const text = bytes.toString('utf8');
    if (text.includes('\ufffd')) problems.push(`${name}: มีอักขระแทนที่ (U+FFFD)`);
    if (text.includes('\u0e42\u20ac')) problems.push(`${name}: มีลำดับอักขระเพี้ยน (เช่น เครื่องหมายขีด/คำพูดที่เสียรูป)`);
    if (/[\u0080-\u009f]/.test(text)) problems.push(`${name}: มีอักขระควบคุม C1 ซึ่งเกิดจากการเข้ารหัสผิด`);
  }
  assert.deepEqual(problems, []);
});
