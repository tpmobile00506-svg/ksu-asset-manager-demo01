import { standardCategories } from './asset-types.ts';

// สาขาวิชา / หน่วยงาน ตามไฟล์ "ตัวย่อของสาขาวิชา" ที่เจ้าหน้าที่พัสดุส่งให้ (17 ต.ค. 2569)
// เครื่องกลกับเมคคาทรอนิกส์เป็นสาขาเดียว · ไม่มีโยธา · ไม่มี "ส่วนกลาง / การศึกษา" (รวมเข้าสำนักงานคณบดี)
export const standardBranches = [
  'วิศวกรรมคอมพิวเตอร์ (วค)',
  'วิศวกรรมไฟฟ้า (วฟ)',
  'วิศวกรรมเครื่องจักรกลเกษตร (คจก)',
  'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)',
  'วิศวกรรมอุตสาหการ (วอ)',
  'วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)',
  'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)',
  'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)',
] as const;

export type StandardBranch = (typeof standardBranches)[number];
export const OFFICE_BRANCH: StandardBranch = 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
// หน่วยงานที่ไม่ใช่สาขาวิชา (ฟอร์มแยกเป็นกลุ่ม "หน่วยงาน" ในรายการเลือก) ที่เหลือคือสาขาวิชา
export const officeBranches: readonly StandardBranch[] = [OFFICE_BRANCH];
export const academicBranches = standardBranches.filter(b => !officeBranches.includes(b));
export const isStandardBranch = (value: string): value is StandardBranch =>
  (standardBranches as readonly string[]).includes(value);

// แปลงข้อความสาขาในไฟล์ (ตัวย่อ ชื่อเต็ม หรือชื่อสาขารุ่นเก่าในฐานข้อมูล) เป็นสาขามาตรฐาน
// ไม่เดาสาขาจากชื่อแผ่นงาน เพราะแผ่นงานคือประเภทครุภัณฑ์ (แผ่น "คอม" มีคอมพิวเตอร์ของทุกสาขา)
// raw = ช่องสาขาในไฟล์/ฟอร์ม · note = หมายเหตุ (ใช้เดาเมื่อช่องสาขาว่าง)
export function normalizeBranch(raw: string, note = ''): string {
  // Prefer an explicit department over incidental department names in the notes.
  const identify = (text: string): string | undefined => {
    const alias = (codes: string) =>
      new RegExp('(^|[^\\p{L}\\p{N}])(' + codes + ')(?=$|[^\\p{L}\\p{N}])', 'u').test(text);
    if (alias('วคม|วศค|มค') || /เครื่องกล|เมคคา|หุ่นยนต์/.test(text))
      return 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)';
    if (alias('สนง|สนอ|ควอ') || /สโมสร|คณบดี|ส่วนกลาง/.test(text)) return OFFICE_BRANCH;
    if (alias('วฟ') || /ไฟฟ้า/.test(text)) return 'วิศวกรรมไฟฟ้า (วฟ)';
    if (alias('วค') || /คอม/.test(text)) return 'วิศวกรรมคอมพิวเตอร์ (วค)';
    if (alias('วอ') || /อุตสาหการ|การผลิต|ช่างกล/.test(text)) return 'วิศวกรรมอุตสาหการ (วอ)';
    if (alias('วล|วย') || /โลจิส|ขนส่ง|โยธา/.test(text)) return 'วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)';
    if (alias('คจก') || /เกษตร/.test(text)) return 'วิศวกรรมเครื่องจักรกลเกษตร (คจก)';
    if (alias('นอส') || /ออกแบบ|ออบแบบ|สถาปัตย์/.test(text)) return 'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)';
  };
  const explicit = raw.trim();
  if (explicit) return identify(explicit) || explicit;
  return identify(note) || OFFICE_BRANCH;
}

// ชื่อย่อสาขาที่ใช้ในรายงาน ตามไฟล์ "ตัวย่อของสาขาวิชา" ของเจ้าหน้าที่พัสดุ (17 ต.ค. 2569)
const branchAbbreviation: Record<StandardBranch, string> = {
  'วิศวกรรมคอมพิวเตอร์ (วค)': 'วค',
  'วิศวกรรมไฟฟ้า (วฟ)': 'วฟ',
  'วิศวกรรมเครื่องจักรกลเกษตร (คจก)': 'คจก',
  'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)': 'วคม',
  'วิศวกรรมอุตสาหการ (วอ)': 'วอ',
  'วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)': 'วล',
  'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)': 'ออกแบบ',
  'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)': 'สนง',
};

export function branchAbbr(branch: string): string {
  const raw = (branch || '').trim();
  if (!raw) return '';
  return branchAbbreviation[normalizeBranch(raw) as StandardBranch] ?? raw;
}

// สาขามาตรฐานทั้งหมดที่ช่องสาขาระบุไว้ เช่น "วอ /คจก" ได้ 2 สาขา — มากกว่า 1 ต้องให้เจ้าหน้าที่เลือก ไม่เดา
export function branchCandidates(raw: string): StandardBranch[] {
  const text = (raw || '').trim();
  const standard = standardBranches as readonly string[];
  if (standard.includes(text)) return [text as StandardBranch];
  const found = new Set<StandardBranch>();
  for (const part of text.split('/')) {
    const branch = part.trim() && normalizeBranch(part.trim());
    if (branch && standard.includes(branch)) found.add(branch as StandardBranch);
  }
  return [...found];
}

// หมวดหมู่ตามสาขา (รุ่นก่อนที่หมวด = แผ่นงาน) ยังใช้อ่านไฟล์ที่ส่งออกจากเว็บรุ่นเก่า
const categoryByStandardBranch: Record<StandardBranch, (typeof standardCategories)[number]> = {
  'วิศวกรรมคอมพิวเตอร์ (วค)': 'คอมพิวเตอร์',
  'วิศวกรรมไฟฟ้า (วฟ)': 'ไฟฟ้า',
  'วิศวกรรมเครื่องจักรกลเกษตร (คจก)': 'เครื่องจักรกลเกษตร',
  'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)': 'เครื่องกล',
  'วิศวกรรมอุตสาหการ (วอ)': 'อุตสาหการ',
  'วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)': 'โลจิสติกส์และโยธา',
  'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)': 'ออกแบบและสถาปัตย์',
  'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)': 'สำนักงานส่วนกลาง',
};

export function resolveCategory(branch: string): string {
  return categoryByStandardBranch[normalizeBranch(branch || '') as StandardBranch] ?? 'สำนักงานส่วนกลาง';
}
