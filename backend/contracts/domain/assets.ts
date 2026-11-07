import type { Asset } from './types.ts';

// กฎของครุภัณฑ์รายตัว: เทียบหมายเลข ช่วงรหัส สรุปสภาพ ผลต่างตรวจนับ และการยกเลิก/กู้คืนรายการที่บันทึกผิด

// หมายเลขครุภัณฑ์ที่ถือว่าเป็นตัวเดียวกัน: ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง (เช่น "ksu165 -1610" = "KSU165-1610")
export const codeKey = (code: string) =>
  (code || '').normalize('NFC').toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');

// หมายเลขแบบช่วง 2 ชิ้น เช่น "…-1(2)ถึง-2(2)" จำนวน 2 → แตกเป็นหมายเลขรายชิ้น · รูปแบบอื่นคืน null ให้เจ้าหน้าที่ตรวจเอง
export function expandRange(code: string, quantity: number): string[] | null {
  if (quantity !== 2) return null;
  const m = code.replace(/\s+/g, '').match(/^(.*-)(\d+)\((\d+)\)ถึง-?(\d+)\(\3\)$/);
  if (!m || Number(m[4]) !== Number(m[2]) + 1) return null;
  return [m[1] + m[2] + '(' + m[3] + ')', m[1] + m[4] + '(' + m[3] + ')'];
}

// ผลต่างการตรวจนับ: เทียบจำนวนที่พบจริงกับจำนวนในทะเบียน ณ วันเปิดรอบ (ขาด / เกิน / ตรง / ยังไม่ได้ตรวจ)
export type StocktakeDifference = { kind: 'unchecked' | 'match' | 'short' | 'over'; amount: number };
export function stocktakeDifference(expected: number, found: number | null | undefined): StocktakeDifference {
  if (found === null || found === undefined) return { kind: 'unchecked', amount: 0 };
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(found) || expected < 0 || found < 0)
    throw Error('จำนวนตรวจนับต้องเป็นจำนวนเต็มไม่ติดลบ');
  if (found === expected) return { kind: 'match', amount: 0 };
  return found < expected ? { kind: 'short', amount: expected - found } : { kind: 'over', amount: found - expected };
}

// การ์ดแดชบอร์ด "ชำรุด / ส่งซ่อม": นับเฉพาะรายการที่ยังใช้งาน (active) จึงไม่นับแม่ที่แบ่งล็อตแล้ว (split) ซ้ำกับลูก
// รายการที่จำหน่ายแล้วนับแยก ไม่ปนกับของที่ยังชำรุดอยู่
export type ConditionSummary = { damaged: number; repair: number; disposed: number };
export function conditionSummary(assets: readonly Pick<Asset, 'condition' | 'lifecycle'>[]): ConditionSummary {
  const out: ConditionSummary = { damaged: 0, repair: 0, disposed: 0 };
  for (const a of assets) {
    if (a.lifecycle === 'disposed') out.disposed++;
    else if (a.lifecycle === 'active' && a.condition === 'damaged') out.damaged++;
    else if (a.lifecycle === 'active' && a.condition === 'repair') out.repair++;
  }
  return out;
}

// การ์ดภาพรวมนับเป็น "ชิ้น" (ผู้ใช้ตกลง 7 พ.ย. 2569): รายการเดียวอาจมี 200 ชิ้น ถ้านับเป็นรายการจะไม่เห็นของที่เสีย
// นับเฉพาะรายการที่ยังใช้งาน (active) · จำนวนที่ไม่ใช่จำนวนเต็มบวกนับเป็น 1 ชิ้น เหมือนกราฟเดิม
export type PieceSummary = {
  items: number;
  total: number;
  normal: number;
  damaged: number;
  repair: number;
  missing: number;
};
export function pieceSummary(assets: readonly Pick<Asset, 'condition' | 'lifecycle' | 'quantity'>[]): PieceSummary {
  const out: PieceSummary = { items: 0, total: 0, normal: 0, damaged: 0, repair: 0, missing: 0 };
  for (const a of assets) {
    if (a.lifecycle !== 'active') continue;
    const n = Number.isSafeInteger(a.quantity) && a.quantity > 0 ? a.quantity : 1;
    out.items++;
    out.total += n;
    if (a.condition === 'normal' || a.condition === 'damaged' || a.condition === 'repair' || a.condition === 'missing')
      out[a.condition] += n;
  }
  return out;
}

// ยกเลิกรายการที่บันทึกผิด (ผู้ใช้ตัดสินใจ 18 ต.ค. 2569): เจ้าหน้าที่/Admin กดเองได้ ไม่ต้องผ่านสายอนุมัติ แต่ต้องใส่เหตุผล
// ใช้ได้เฉพาะรายการที่ยังไม่มีอะไรเกิดขึ้นกับมัน · ยกเลิกแล้ว lifecycle = 'voided' อยู่หมวด "ข้อมูลผิดพลาด" ไม่นับในทะเบียน รายงาน และ Excel
// คืนข้อความเหตุผลที่ยกเลิกไม่ได้ ('' = ยกเลิกได้)
export function voidBlockReason(
  a: Pick<Asset, 'lifecycle' | 'parentId' | 'setId'>,
  history: { requests: number; counted: number },
): string {
  if (a.lifecycle !== 'active') return 'รายการนี้ไม่อยู่ในทะเบียนที่ถือครองแล้ว จึงยกเลิกไม่ได้';
  if (a.parentId) return 'รายการนี้มาจากการแยกรายการ จึงยกเลิกไม่ได้';
  if (a.setId) return 'ครุภัณฑ์ในชุดห้ามแยก จึงยกเลิกทีละรายการไม่ได้';
  if (history.requests) return 'รายการนี้เคยมีคำขอโอนย้าย/ซ่อม/จำหน่ายแล้ว จึงยกเลิกไม่ได้';
  if (history.counted) return 'รายการนี้เคยถูกตรวจนับแล้ว จึงยกเลิกไม่ได้';
  return '';
}
// หมายเลขครุภัณฑ์ห้ามซ้ำในฐานข้อมูล: เติมท้ายรหัสของรายการที่ยกเลิก ให้เพิ่มรายการที่ถูกต้องด้วยรหัสเดิมได้
export const voidedCode = (code: string, id: string) => `${code} (ยกเลิก ${id.slice(0, 8)})`;
// กู้คืนรายการที่ยกเลิก: ตัดส่วนท้ายที่ voidedCode เติมไว้ คืนรหัสเดิม (รหัสที่ไม่มีส่วนท้ายนี้คืนตามเดิม)
export function restoredCode(code: string, id: string): string {
  const suffix = voidedCode('', id);
  return code.endsWith(suffix) ? code.slice(0, -suffix.length) : code;
}
