import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trace, traced, traceSql, describeSql, describeAction } from '../debug/trace';

// โหมดดูการทำงานหลังบ้าน (npm run dev:trace): ปิดเป็นค่าเริ่มต้น และเมื่อเปิดต้องเล่าเป็นภาษาคน
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
async function capture(level: string | undefined, run: () => Promise<unknown>) {
  const previous = process.env.DEBUG_TRACE, original = console.log, lines: string[] = [];
  if (level === undefined) delete process.env.DEBUG_TRACE; else process.env.DEBUG_TRACE = level;
  console.log = (...args: unknown[]) => { lines.push(strip(args.map(String).join(' '))); };
  try { await run(); } catch { /* ข้อผิดพลาดที่ตั้งใจโยน ตรวจจากข้อความ */ } finally {
    console.log = original;
    if (previous === undefined) delete process.env.DEBUG_TRACE; else process.env.DEBUG_TRACE = previous;
  }
  return lines.filter(Boolean);
}

test('แปล SQL เป็นภาษาคน: INSERT/SELECT/UPDATE/DELETE กับชื่อตาราง และคำสั่งคุม transaction', () => {
  assert.equal(describeSql('INSERT INTO "public"."assets" ("id","code") VALUES ($1,$2)').text, 'เพิ่มแถวใหม่ในตาราง assets (ทะเบียนครุภัณฑ์)');
  assert.equal(describeSql('SELECT "public"."users"."id" FROM "public"."users" WHERE "id" = $1').text, 'อ่านจากตาราง users (ผู้ใช้)');
  assert.equal(describeSql('UPDATE "public"."requests" SET "stage" = $1').text, 'แก้ไขแถวในตาราง requests (คำขอ)');
  assert.equal(describeSql('DELETE FROM "public"."auth_sessions" WHERE 1=1').text, 'ลบแถวในตาราง auth_sessions (เซสชันล็อกอิน)');
  assert.equal(describeSql('INSERT INTO "login_attempts" ("key") VALUES ($1) ON CONFLICT ("key") DO UPDATE SET x = 1').table, 'login_attempts');
  assert.equal(describeSql('COMMIT').text, 'ยืนยันการบันทึกทั้งหมด (COMMIT)');
  assert.equal(describeSql('ROLLBACK').verb, 'ROLLBACK');
  assert.equal(describeAction('create'), 'เพิ่มครุภัณฑ์ใหม่');
  assert.equal(describeAction('sourceArchive'), 'คำสั่ง “sourceArchive”');
});

test('ปิดเป็นค่าเริ่มต้น: ไม่มี DEBUG_TRACE ไม่พิมพ์อะไรเลย และงานยังทำงานตามปกติ', async () => {
  let ran = false;
  const lines = await capture(undefined, async () => {
    const r = await traced('POST', '/api/data', async () => { trace.ok('ไม่ควรเห็น'); traceSql('COMMIT', 1); ran = true; return 1; });
    assert.equal(r, 1);
  });
  assert.equal(ran, true);
  assert.deepEqual(lines, []);
});

test('เปิดแล้ว (POST): หัวเรื่อง → ขั้นตอน → SQL ทีละคำสั่ง → สรุปผล และใช้เลขคำขอเดียวกันทุกบรรทัด', async () => {
  const lines = await capture('1', () => traced('POST', '/api/data', async () => {
    trace.ok('ตรวจสิทธิ์ผ่าน');
    traceSql('INSERT INTO "public"."assets" ("id") VALUES ($1)', 3.4);
    traceSql('COMMIT', 1);
    return new Response('{}', { status: 200 });
  }));
  const id = lines[0].match(/#(\d+)/)?.[1];
  assert.ok(id && lines.every(l => l.includes(`#${id}`)), lines.join('\n'));
  assert.match(lines[0], /POST \/api\/data · หน้าเว็บส่งคำสั่ง/);
  assert.match(lines[1], /✓ ตรวจสิทธิ์ผ่าน/);
  assert.match(lines[2], /SQL ▸ INSERT … assets \(3 ms\) → เพิ่มแถวใหม่ในตาราง assets/);
  assert.match(lines[3], /SQL ▸ COMMIT/);
  assert.match(lines[4], /✓ ส่งผลกลับหน้าเว็บ \(200\) · ใช้เวลา \d+ ms · SQL 2 คำสั่ง/);
  assert.ok(!lines.join('\n').includes('$1'), 'ไม่แสดงตัวแปร SQL ในโหมดอ่านง่าย');
});

test('เปิดแล้ว (GET): SELECT หลายคำสั่งสรุปเป็นบรรทัดเดียว ไม่ท่วมหน้าจอ', async () => {
  const lines = await capture('1', () => traced('GET', '/api/data', async () => {
    traceSql('SELECT * FROM "public"."assets"', 1);
    traceSql('SELECT * FROM "public"."requests"', 1);
    traceSql('SELECT * FROM "public"."assets" WHERE 1=1', 1);
    return new Response('{}');
  }));
  assert.equal(lines.filter(l => l.includes('SQL ▸')).length, 1);
  assert.match(lines.join('\n'), /อ่านข้อมูล 3 คำสั่ง จาก 2 ตาราง: assets, requests/);
});

test('ผิดพลาด: Response 409 แสดงข้อความจากเซิร์ฟเวอร์ · error ที่โยนออกมาแสดง ✗ แล้วโยนต่อ', async () => {
  const conflict = await capture('1', () => traced('POST', '/api/data', async () =>
    Response.json({ error: 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่' }, { status: 409 })));
  assert.match(conflict.at(-1)!, /✗ ส่งข้อผิดพลาดกลับหน้าเว็บ \(409\): ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่/);
  let rethrown = false;
  const thrown = await capture('1', async () => {
    try { await traced('POST', '/api/auth/login', async () => { throw Object.assign(new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'), { status: 401 }); }); }
    catch { rethrown = true; }
  });
  assert.equal(rethrown, true);
  assert.match(thrown.at(-1)!, /✗ ไม่สำเร็จ \(401\): อีเมลหรือรหัสผ่านไม่ถูกต้อง/);
});
