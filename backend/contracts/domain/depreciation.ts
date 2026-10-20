import type { Asset } from './types.ts';
import { isoDateStart } from './dates.ts';

// ค่าเสื่อมราคาแบบเส้นตรง และอายุการใช้งานคงเหลือ (1 ปี = 365.25 วัน)
export function bookValue(
  a: Pick<Asset, 'receivedDate' | 'lifeYears' | 'salvageSatang' | 'totalSatang'>,
  at = new Date(),
): number | null {
  if (!a.receivedDate || !a.lifeYears) return null;
  const days = elapsedDays(a.receivedDate, at);
  if (days === null) return null;
  return Math.max(
    a.salvageSatang,
    a.totalSatang - Math.floor((a.totalSatang - a.salvageSatang) * Math.min(days / (a.lifeYears * 365.25), 1)),
  );
}

// จำนวนวันเต็มตั้งแต่วันรับถึงวันที่คำนวณ (ไม่ติดลบ) · วันที่รับว่างหรือไม่มีจริง → null
function elapsedDays(receivedDate: string, at: Date): number | null {
  const start = isoDateStart(receivedDate);
  if (!start) return null;
  return Math.max(0, Math.floor((at.getTime() - start.getTime()) / 86400000));
}

// อายุการใช้งานคงเหลือ (ปี) ใช้ฐานวันเดียวกับ bookValue (1 ปี = 365.25 วัน) คืน null ถ้าไม่มีวันรับหรืออายุใช้งาน
export function remainingLifeYears(a: Pick<Asset, 'receivedDate' | 'lifeYears'>, at = new Date()): number | null {
  if (!a.lifeYears) return null;
  const days = elapsedDays(a.receivedDate, at);
  if (days === null) return null;
  return Math.max(0, a.lifeYears * 365.25 - days) / 365.25;
}
export type LifeBucket = 'unknown' | 'expired' | 'within1' | 'within3' | 'over3';
export const lifeBucketLabels: Record<LifeBucket, string> = {
  unknown: 'ไม่ระบุวันรับ/อายุใช้งาน',
  expired: 'ครบอายุการใช้งานแล้ว',
  within1: 'เหลือไม่เกิน 1 ปี',
  within3: 'เหลือมากกว่า 1 ถึง 3 ปี',
  over3: 'เหลือมากกว่า 3 ปี',
};
export function lifeBucket(a: Pick<Asset, 'receivedDate' | 'lifeYears'>, at = new Date()): LifeBucket {
  const r = remainingLifeYears(a, at);
  if (r === null) return 'unknown';
  if (r === 0) return 'expired';
  if (r <= 1) return 'within1';
  if (r <= 3) return 'within3';
  return 'over3';
}
