import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purgeExpiredSessions } from '../auth/sessions';

// เซสชันจำลองในหน่วยความจำ ที่ deleteMany ทำตามเงื่อนไข expiresAt <= เวลาที่กำหนด
function fakeClient(sessions: Array<{ id: string; expiresAt: Date }>) {
  return {
    sessions,
    client: {
      session: {
        deleteMany: async ({ where }: { where: { expiresAt: { lte: Date } } }) => {
          const before = sessions.length;
          for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].expiresAt <= where.expiresAt.lte) sessions.splice(i, 1);
          return { count: before - sessions.length };
        },
      },
    },
  };
}

const at = (iso: string) => new Date(iso);

test('ลบเฉพาะเซสชันที่หมดอายุ: 3 รายการ หมดอายุ 2 → ลบ 2 เหลือ 1', async () => {
  const { sessions, client } = fakeClient([
    { id: 'old-1', expiresAt: at('2026-10-01T00:00:00Z') },
    { id: 'old-2', expiresAt: at('2026-10-08T23:59:59Z') },
    { id: 'valid', expiresAt: at('2026-10-09T08:00:00Z') },
  ]);
  const removed = await purgeExpiredSessions(client, at('2026-10-09T00:00:00Z'));
  assert.equal(removed, 2);
  assert.deepEqual(sessions.map(s => s.id), ['valid']);
});

test('เซสชันที่หมดอายุพอดี ณ เวลาปัจจุบันถือว่าหมดอายุ (ตรงกับ member() ที่ใช้ expiresAt <= now)', async () => {
  const { sessions, client } = fakeClient([{ id: 'edge', expiresAt: at('2026-10-09T00:00:00Z') }]);
  assert.equal(await purgeExpiredSessions(client, at('2026-10-09T00:00:00Z')), 1);
  assert.equal(sessions.length, 0);
});

test('ไม่มีเซสชันหมดอายุ → ไม่ลบอะไร', async () => {
  const { sessions, client } = fakeClient([{ id: 'valid', expiresAt: at('2026-10-10T00:00:00Z') }]);
  assert.equal(await purgeExpiredSessions(client, at('2026-10-09T00:00:00Z')), 0);
  assert.equal(sessions.length, 1);
});
