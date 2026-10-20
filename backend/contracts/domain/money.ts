// เงินเก็บเป็น "สตางค์" จำนวนเต็มเสมอ (1 บาท = 100 สตางค์) ไม่ใช้ทศนิยม เพราะ 0.1 + 0.2 ในคอมพิวเตอร์ไม่เท่ากับ 0.3 พอดี
// satang() แปลงข้อความที่ผู้ใช้กรอก → สตางค์ · money() แปลงสตางค์ → ข้อความแสดงผล · splitAmounts() แบ่งยอดเงินตอนแบ่งล็อต
export function satang(value: unknown): number {
  const text = String(value ?? '')
    .replace(/,/g, '')
    .trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error('กรุณากรอกจำนวนเงินไม่ติดลบ และทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole, part = ''] = text.split('.');
  const n = Number(BigInt(whole) * 100n + BigInt(part.padEnd(2, '0')));
  if (!Number.isSafeInteger(n) || n > 100000000000000) throw Error('จำนวนเงินเกินขอบเขตที่รองรับ');
  return n;
}
export function splitAmounts(quantity: number, total: number, take: number) {
  if (
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(take) ||
    take <= 0 ||
    take >= quantity ||
    !Number.isSafeInteger(total) ||
    total < 0
  )
    throw Error('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1');
  const first = Number((BigInt(total) * BigInt(take)) / BigInt(quantity));
  return [first, total - first];
}

export const money = (n: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100);
