// ปีงบประมาณไทย (เริ่ม 1 ต.ค.) และการแสดงวันที่แบบ พ.ศ.
export function fiscalYearAsOfDate(fiscalYear: number | string): Date {
  const yearBE = Number(fiscalYear) || 2569;
  const yearCE = yearBE - 543;
  return new Date(`${yearCE}-09-30T23:59:59Z`);
}
// ปีงบประมาณ (พ.ศ.) ของวันที่: เริ่ม 1 ต.ค. เช่น 13 ส.ค. 2569 → 2569, 1 ต.ค. 2569 → 2570
export function fiscalYearOf(date: Date): number {
  return date.getFullYear() + 543 + (date.getMonth() >= 9 ? 1 : 0);
}
// ปีงบประมาณตามเวลาประเทศไทย (UTC+7) ไม่ขึ้นกับ timezone ของเซิร์ฟเวอร์ (Vercel เป็น UTC) เช่น 1 ต.ค. 2569 07:00 น. → 2570
export function thaiFiscalYear(iso: string): number {
  const t = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return t.getUTCFullYear() + 543 + (t.getUTCMonth() >= 9 ? 1 : 0);
}

// วันที่แบบ ISO (yyyy-mm-dd) -> "1 ต.ค. 2569" (พ.ศ.) ถ้าไม่ใช่วันที่จริงคืนข้อความเดิม
const thaiMonthsShort = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
export function thaiDateOnly(iso: string): string {
  const d = (iso || '').trim();
  const start = new Date(d + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== d)
    return iso;
  return `${start.getUTCDate()} ${thaiMonthsShort[start.getUTCMonth()]} ${start.getUTCFullYear() + 543}`;
}
