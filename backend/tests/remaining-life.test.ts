import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingLifeYears, lifeBucket } from '../contracts/domain';

const at = (iso: string) => new Date(iso + 'T00:00:00Z');
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

// คำนวณมือ: 1 ปี = 365.25 วัน, อายุคงเหลือ = (อายุใช้งาน×365.25 − วันที่ผ่านไป) ÷ 365.25

test('รับ 2024-01-01 อายุ 1 ปี ณ 2024-04-10: ผ่านไป 100 วัน (31+29+31+9) → เหลือ 265.25 วัน = 0.7 ปี', () => {
  assert.equal(round1(remainingLifeYears({ receivedDate: '2024-01-01', lifeYears: 1 }, at('2024-04-10'))), 0.7);
});

test('ครบอายุแล้วคืน 0 ไม่ติดลบ (รับ 2024-01-01 อายุ 1 ปี ณ 2026-01-01)', () => {
  assert.equal(remainingLifeYears({ receivedDate: '2024-01-01', lifeYears: 1 }, at('2026-01-01')), 0);
});

test('วันแรก (ผ่านไป 0 วัน) เหลือเต็มอายุ: อายุ 5 ปี → 5 ปี', () => {
  assert.equal(remainingLifeYears({ receivedDate: '2024-01-01', lifeYears: 5 }, at('2024-01-01')), 5);
});

test('ไม่มีวันรับ ไม่มีอายุใช้งาน หรือวันที่ไม่มีจริง → null', () => {
  assert.equal(remainingLifeYears({ receivedDate: '', lifeYears: 5 }, at('2026-01-01')), null);
  assert.equal(remainingLifeYears({ receivedDate: '2024-01-01', lifeYears: 0 }, at('2026-01-01')), null);
  assert.equal(remainingLifeYears({ receivedDate: '2024-02-31', lifeYears: 5 }, at('2026-01-01')), null);
});

test('ช่วงอายุคงเหลือ: ไม่ระบุ / ครบอายุ / ไม่เกิน 1 ปี / 1-3 ปี / มากกว่า 3 ปี', () => {
  assert.equal(lifeBucket({ receivedDate: '', lifeYears: 5 }, at('2026-01-01')), 'unknown');
  assert.equal(lifeBucket({ receivedDate: '2024-01-01', lifeYears: 1 }, at('2026-01-01')), 'expired');
  assert.equal(lifeBucket({ receivedDate: '2024-01-01', lifeYears: 1 }, at('2024-04-10')), 'within1');   // เหลือ 0.73
  assert.equal(lifeBucket({ receivedDate: '2024-01-01', lifeYears: 3 }, at('2025-01-01')), 'within3');   // ผ่าน 366 วัน เหลือ 729.75 วัน = 1.998 ปี
  assert.equal(lifeBucket({ receivedDate: '2024-01-01', lifeYears: 10 }, at('2026-01-01')), 'over3');     // ผ่าน 731 วัน เหลือ 3,652.5-731 = 2,921.5 วัน = 7.998 ปี
  assert.equal(lifeBucket({ receivedDate: '2024-01-01', lifeYears: 3 }, at('2024-01-01')), 'within3');   // เหลือเต็ม 3.0 ปี ตกช่วง ≤ 3
});
