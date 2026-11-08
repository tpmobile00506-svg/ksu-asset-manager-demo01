import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renewalDue, sessionCookie, SESSION_IDLE_SECONDS } from '../auth/sessions';

// เซสชันต่ออายุเองระหว่างใช้งาน (ผู้ใช้เลือก 8 พ.ย. 2569): ไม่ได้ใช้ 2 ชั่วโมงจึงหลุด
// ต่ออายุอย่างมากทุก 5 นาที = ต่อเมื่อเวลาที่เหลือน้อยกว่า 2 ชม. − 5 นาที = 115 นาที

const now = new Date('2026-11-08T09:00:00.000Z');
const after = (minutes: number, seconds = 0) => new Date(now.getTime() + (minutes * 60 + seconds) * 1000);

test('อายุเซสชัน 2 ชั่วโมง = 7,200 วินาที และ cookie ใช้อายุเดียวกัน', () => {
  assert.equal(SESSION_IDLE_SECONDS, 7200);
  const cookie = sessionCookie('a'.repeat(64));
  assert.match(cookie, /^ksu_session=a{64}; /);
  assert.match(cookie, /; Max-Age=7200(;|$)/);
  assert.match(cookie, /HttpOnly/);
  assert.match(sessionCookie('', 0), /Max-Age=0/);
});

test('ต่ออายุเมื่อใช้ไปแล้วอย่างน้อย 5 นาทีนับจากครั้งล่าสุด (ไม่เขียนฐานข้อมูลทุกครั้ง)', () => {
  // เพิ่งต่ออายุ: เหลือ 120 นาที → ยังไม่ต่อ
  assert.equal(renewalDue(after(120), now), false);
  // ผ่านไป 4 นาที: เหลือ 116 นาที → ยังไม่ต่อ
  assert.equal(renewalDue(after(116), now), false);
  // ผ่านไปพอดี 5 นาที: เหลือ 115 นาที (ไม่น้อยกว่า 115) → ยังไม่ต่อ
  assert.equal(renewalDue(after(115), now), false);
  // ผ่านไป 5 นาที 1 วินาที: เหลือ 114 นาที 59 วินาที → ต่อ
  assert.equal(renewalDue(after(114, 59), now), true);
  // เหลือ 1 นาทีก่อนหลุด → ต่อ
  assert.equal(renewalDue(after(1), now), true);
  // เซสชันเก่าที่ออกแบบ 8 ชั่วโมงไว้ก่อนเปลี่ยน: เหลือ 7 ชั่วโมง → ยังไม่ต่อ (ใช้ได้จนเหลือไม่ถึง 115 นาทีแล้วค่อยต่อ)
  assert.equal(renewalDue(after(7 * 60), now), false);
});
