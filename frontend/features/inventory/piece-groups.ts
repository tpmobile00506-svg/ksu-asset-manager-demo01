import type { Asset } from '@/shared/domain';

// รวมชิ้นที่ "แยกรายชิ้น" (QR คนละดวง) เป็นแถวเดียวในหน้าทะเบียน กดแล้วกางดูทีละชิ้น
// ไม่แตะฐานข้อมูล: แค่จัดแถวที่จะแสดงจากรายการที่กรองและเรียงแล้ว

// แยกรายการแบบเดิม (แบ่งล็อต) และหมายเลขแบบช่วง "…ถึง…" ได้ลูก 2 รายการเสมอ
// ส่วนแยกรายชิ้นได้ลูกเท่าจำนวนชิ้น จึงนับเป็นกลุ่มรายชิ้นเมื่อมีลูกตั้งแต่ 3 รายการ
// (แยกรายชิ้นของ 2 ชิ้นจึงแสดง 2 แถวตามเดิม ซึ่งไม่ยาว)
export const MIN_PIECE_FAMILY = 3;

export type RegistryRow = { kind: 'asset'; asset: Asset } | { kind: 'group'; key: string; items: Asset[] };

// รหัสของรายการต้นทาง (แม่) ที่ถือเป็นกลุ่มรายชิ้น นับลูกจากทุกรายการ (ไม่ขึ้นกับตัวกรอง)
// กลุ่มจะได้ไม่เปลี่ยนไปมาตามตัวกรองที่เลือก
export function pieceFamilies(assets: Pick<Asset, 'parentId'>[]): Set<string> {
  const children = new Map<string, number>();
  for (const a of assets) if (a.parentId) children.set(a.parentId, (children.get(a.parentId) ?? 0) + 1);
  return new Set([...children].filter(([, n]) => n >= MIN_PIECE_FAMILY).map(([id]) => id));
}

// จัดแถว: ชิ้นของกลุ่มเดียวกันรวมเป็นแถวเดียว วางตรงตำแหน่งชิ้นแรกตามการเรียงที่เลือก
// ถ้าตัวกรองเหลือชิ้นของกลุ่มนั้นชิ้นเดียว (เช่น ค้นหาเลขชิ้นตรงๆ) แสดงเป็นแถวธรรมดา
export function groupRows(filtered: Asset[], families: Set<string>): RegistryRow[] {
  const visible = new Map<string, number>();
  for (const a of filtered)
    if (a.parentId && families.has(a.parentId)) visible.set(a.parentId, (visible.get(a.parentId) ?? 0) + 1);
  const rows: RegistryRow[] = [];
  const groups = new Map<string, Asset[]>();
  for (const a of filtered) {
    const key = a.parentId;
    if (!key || (visible.get(key) ?? 0) < 2) {
      rows.push({ kind: 'asset', asset: a });
      continue;
    }
    const items = groups.get(key);
    if (items) items.push(a);
    else {
      const first = [a];
      groups.set(key, first);
      rows.push({ kind: 'group', key, items: first });
    }
  }
  return rows;
}

// รายการทั้งหมดในแถวชุดนี้ (กลุ่มที่พับอยู่ก็นับทุกชิ้น) ใช้กับ "เลือกทั้งหมดในหน้านี้"
export function rowAssets(rows: RegistryRow[]): Asset[] {
  return rows.flatMap(r => (r.kind === 'group' ? r.items : [r.asset]));
}

// ช่วงหมายเลขของกลุ่ม เช่น "CH-68-001-001(020) ถึง 020(020)": ตัดส่วนหน้าที่ซ้ำกันออกจากหมายเลขท้าย
// ตัดตรงตัวคั่น (- / ( ช่องว่าง) เท่านั้น จะได้ไม่ตัดกลางตัวเลข
const codeOrder = new Intl.Collator('th', { numeric: true });
export function codeRange(items: Pick<Asset, 'code'>[]): string {
  if (!items.length) return '';
  const codes = items.map(a => a.code).sort(codeOrder.compare);
  const first = codes[0],
    last = codes[codes.length - 1];
  if (first === last) return first;
  let same = 0;
  while (same < first.length && same < last.length && first[same] === last[same]) same++;
  let cut = same;
  while (cut > 0 && !'-/( '.includes(last[cut - 1])) cut--;
  return `${first} ถึง ${last.slice(cut)}`;
}

// ค่าที่ทุกชิ้นเหมือนกันแสดงค่านั้น ต่างกันแสดงคำว่า "หลาย…"
export function commonValue(values: string[], mixed: string): string {
  const unique = new Set(values);
  return unique.size === 1 ? values[0] : mixed;
}

// นับชิ้นตามสภาพ เรียงตามจำนวนมากไปน้อย เช่น [['normal', 19], ['damaged', 1]]
export function conditionCounts(items: Pick<Asset, 'condition'>[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of items) counts.set(a.condition, (counts.get(a.condition) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}
