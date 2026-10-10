import test from 'node:test';
import assert from 'node:assert/strict';
import { bookValue, fiscalYearAsOfDate } from '../contracts/domain';

test('เคส 1: วันที่รับเข้า (Day 0) มูลค่า = ราคาทุนเต็ม', () => {
  const asset = {
    receivedDate: '2024-01-01',
    lifeYears: 5,
    salvageSatang: 100,
    totalSatang: 100_000,
  };
  const at = new Date('2024-01-01T00:00:00Z');
  // คำนวณมือ: days = 0, ratio = 0, accDep = 0, bookValue = 100,000
  assert.equal(bookValue(asset, at), 100_000);
});

test('เคส 2: การนับวันข้ามวันที่ 30 ก.ย. → 1 ต.ค.', () => {
  // รับเข้า 2023-10-01 (วันแรกปีงบประมาณ 2567), ทุน 365,250 สตางค์, อายุ 1 ปี (365.25 วัน), ซาก 0
  const asset = {
    receivedDate: '2023-10-01',
    lifeYears: 1,
    salvageSatang: 0,
    totalSatang: 365_250,
  };

  // 2.1 ณ สิ้นปีงบประมาณ 2567: 30 ก.ย. 2024 เวลา 00:00:00Z (ผ่านไป 365 วัน)
  // คำนวณมือ: days = 365, ratio = 365 / 365.25 = 0.9993155...
  // accDep = Math.floor(365,250 * (365 / 365.25)) = 365,000
  // bookValue = 365,250 - 365,000 = 250 สตางค์
  const atSep30 = new Date('2024-09-30T00:00:00Z');
  assert.equal(bookValue(asset, atSep30), 250);

  // 2.2 ข้ามไปวันแรกปีงบประมาณถัดไป: 1 ต.ค. 2024 เวลา 00:00:00Z (ผ่านไป 366 วัน)
  // คำนวณมือ: days = 366, ratio = min(366 / 365.25, 1) = 1
  // accDep = 365,250
  // bookValue = 365,250 - 365,250 = 0 สตางค์
  const atOct1 = new Date('2024-10-01T00:00:00Z');
  assert.equal(bookValue(asset, atOct1), 0);

  // 2.3 ทดสอบโค้ดคำนวณ asOfDate สิ้นปีงบประมาณจาก reports-view.tsx
  const asOf2567 = fiscalYearAsOfDate(2567);
  assert.equal(asOf2567.toISOString(), '2024-09-30T23:59:59.000Z');

  const asOfDefault = fiscalYearAsOfDate('');
  assert.equal(asOfDefault.toISOString(), '2026-09-30T23:59:59.000Z');

  // ตรวจสอบ bookValue เมื่อใช้ asOfDate ณ 23:59:59Z ของ 30 ก.ย. 2024
  // days = Math.floor((2024-09-30T23:59:59Z - 2023-10-01T00:00:00Z) / 86400000) = 365 วัน
  // ผลลัพธ์ต้องได้ 250 สตางค์เช่นเดียวกัน
  assert.equal(bookValue(asset, asOf2567), 250);
});

test('เคส 3: ทดสอบขอบเขตอายุการใช้งานจริง (วันที่ 1826 ยังไม่ชน floor vs วันที่ 1827 ชน floor) และเกินอายุ', () => {
  // ทุน 1,000,000 สตางค์, ซาก 100 สตางค์ (1 บาท), อายุ 5 ปี (5 * 365.25 = 1826.25 วัน)
  // ฐานคิดค่าเสื่อม = 1,000,000 - 100 = 999,900 สตางค์
  const asset = {
    receivedDate: '2020-01-01',
    lifeYears: 5,
    salvageSatang: 100,
    totalSatang: 1_000_000,
  };
  const d0 = new Date('2020-01-01T00:00:00Z');

  // 3.1 วันที่ 1826 (2024-12-31T00:00:00Z): ยังไม่ชน floor
  // วิธีคิดมือ:
  // days = 1826 < 1826.25
  // ratio = 1826 / 1826.25
  // accDep = Math.floor(999,900 * 1826 / 1826.25) = Math.floor(999,763.1211...) = 999,763
  // bookValue = 1,000,000 - 999,763 = 237 สตางค์ (ยังไม่ชน floor 100)
  const d1826 = new Date(d0.getTime() + 1826 * 86_400_000);
  assert.equal(d1826.toISOString(), '2024-12-31T00:00:00.000Z');
  assert.equal(bookValue(asset, d1826), 237);

  // 3.2 วันที่ 1827 (2025-01-01T00:00:00Z): ชน floor พอดี
  // วิธีคิดมือ:
  // days = 1827 > 1826.25 -> ratio = 1
  // accDep = Math.floor(999,900 * 1) = 999,900
  // bookValue = Math.max(100, 1,000,000 - 999,900) = 100 สตางค์
  const d1827 = new Date(d0.getTime() + 1827 * 86_400_000);
  assert.equal(d1827.toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(bookValue(asset, d1827), 100);

  // 3.3 เกินอายุการใช้งานไปอีก 10 ปี (2035-01-01T00:00:00Z)
  // คำนวณมือ: ratio = 1, bookValue ถูกดึงไว้ที่ floor = 100 สตางค์
  const dOver = new Date('2035-01-01T00:00:00Z');
  assert.equal(bookValue(asset, dOver), 100);
});

test('เคส 4: มูลค่าซาก 0 สตางค์ เทียบกับ 1 บาท (100 สตางค์)', () => {
  // ทุน 50,000 สตางค์, อายุ 2 ปี (730.5 วัน), วัดผลที่ 800 วัน (เกินอายุ)
  const at = new Date('2024-01-01T00:00:00Z');
  const dOver = new Date(at.getTime() + 800 * 86_400_000);

  // 4.1 ซาก 0 สตางค์ -> bookValue = 0
  assert.equal(bookValue({ receivedDate: '2024-01-01', lifeYears: 2, salvageSatang: 0, totalSatang: 50_000 }, dOver), 0);

  // 4.2 ซาก 100 สตางค์ (1 บาท) -> bookValue = 100
  assert.equal(bookValue({ receivedDate: '2024-01-01', lifeYears: 2, salvageSatang: 100, totalSatang: 50_000 }, dOver), 100);
});

test('เคส 5: การปัดเศษสตางค์ (ราคาที่หารไม่ลงตัว)', () => {
  // ทุน 100,001 สตางค์, ซาก 100 สตางค์, อายุ 3 ปี (1095.75 วัน)
  // ฐานคิดค่าเสื่อม = 100,001 - 100 = 99,901 สตางค์
  // วัดผล ณ 100 วัน (at = 2024-04-10T00:00:00Z)
  // วิธีคิดมือ:
  // depreciable * ratio = 99,901 * (100 / 1095.75) = 9,990,100 / 1095.75 = 9,117.1344...
  // accDep = Math.floor(9,117.1344...) = 9,117 สตางค์
  // bookValue = 100,001 - 9,117 = 90,884 สตางค์
  const asset = {
    receivedDate: '2024-01-01',
    lifeYears: 3,
    salvageSatang: 100,
    totalSatang: 100_001,
  };
  const at100Days = new Date('2024-04-10T00:00:00Z');
  assert.equal(bookValue(asset, at100Days), 90_884);
});

test('เคส 6: วันที่ผิดรูปแบบ / วันที่อนาคต / ราคาทุน 0', () => {
  // 6.1 วันที่รับเข้าในอนาคต (at < receivedDate): คืนราคาทุนเต็ม
  assert.equal(
    bookValue({ receivedDate: '2026-01-01', lifeYears: 5, salvageSatang: 100, totalSatang: 50_000 }, new Date('2025-01-01T00:00:00Z')),
    50_000
  );

  // 6.2 วันที่ผิดรูปแบบ: สตริงที่ไม่สามารถแปลงเป็น Date ได้ คืน null
  assert.equal(
    bookValue({ receivedDate: 'invalid-date', lifeYears: 5, salvageSatang: 100, totalSatang: 50_000 }, new Date('2025-01-01T00:00:00Z')),
    null
  );
  assert.equal(
    bookValue({ receivedDate: '', lifeYears: 5, salvageSatang: 100, totalSatang: 50_000 }, new Date('2025-01-01T00:00:00Z')),
    null
  );

  // วันที่ไม่มีจริงในปฏิทิน: 2024-02-31
  // ตามการคำนวณมือ/ปฏิทินจริง วันที่ 31 ก.พ. ไม่มีอยู่จริง คาดหวัง null
  // (หาก JS Date rollover เป็น 2024-03-02 จะได้ 836 ซึ่งจะทำให้ assert นี้รายงานความต่าง)
  assert.equal(
    bookValue({ receivedDate: '2024-02-31', lifeYears: 1, salvageSatang: 0, totalSatang: 1_000 }, new Date('2024-05-01T00:00:00Z')),
    null
  );

  // 6.3 lifeYears เป็น 0 คืน null
  assert.equal(
    bookValue({ receivedDate: '2024-01-01', lifeYears: 0, salvageSatang: 100, totalSatang: 50_000 }, new Date('2025-01-01T00:00:00Z')),
    null
  );

  // 6.4 ราคาทุน 0 คืน 0
  assert.equal(
    bookValue({ receivedDate: '2024-01-01', lifeYears: 5, salvageSatang: 0, totalSatang: 0 }, new Date('2025-01-01T00:00:00Z')),
    0
  );

  // 6.5 เวลาที่ไม่ใช่เที่ยงคืน (23:59:59 ในวันเดียวกัน ยังไม่ครบ 24 ชม. ถือเป็น Day 0)
  assert.equal(
    bookValue({ receivedDate: '2024-01-01', lifeYears: 5, salvageSatang: 100, totalSatang: 100_000 }, new Date('2024-01-01T23:59:59Z')),
    100_000
  );
});
