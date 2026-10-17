export const roles = {staff:'เจ้าหน้าที่พัสดุ (Staff)',head:'หัวหน้าสาขา (Head)',deputy:'รองคณบดี (Deputy)',dean:'คณบดี (Dean)',admin:'ผู้ดูแลระบบ (Admin)',tester:'ผู้ทดสอบระบบ (Tester)'} as const;
export type Role = keyof typeof roles;
export const conditions = {normal:'ปกติ',damaged:'ชำรุด',repair:'กำลังซ่อม',missing:'ไม่พบ'} as const;
export const requestTypes = {transfer:'โอนย้าย',repair:'ซ่อมบำรุง',disposal:'จำหน่าย / ตัดบัญชี'} as const;
export const headers11 = ['ลำดับ','หมายเลขครุภัณฑ์','รายการ','จำนวน','ราคาต่อหน่วย','จำนวนเงิน','หมายเหตุ','สถานที่','สาขา','หมวด (กลุ่มต่างๆ)','สำนักงาน'];
export type Asset = {imageVersion?:string|null;imageUrl?:string|null;id:string;code:string;name:string;quantity:number;unitSatang:number;totalSatang:number;notes:string;location:string;branch:string;groupName:string;category:string;condition:string;lifecycle:string;version:number;parentId:string|null;sourceId:string|null;sourceRow:string|null;receivedDate:string;lifeYears:number;salvageSatang:number;serial:string;brand:string;custodian:string;createdAt:string;setId?:string|null;setRole?:string|null;setName?:string|null;setKind?:string|null;fundId?:string|null;fundHintId?:string|null;fundName?:string|null};
// ชุดครุภัณฑ์ที่ห้ามแยก: package = หัวชุดไม่มีลำดับแต่มีราคา, lot = หัวชุดมีลำดับและราคา, heading = หัวข้อชุดไม่มีราคา
// ชุดห้ามแยก (package/lot) · heading = บรรทัดหัวทุน/โครงการในไฟล์ต้นฉบับ (ใช้ระหว่างตรวจไฟล์เท่านั้น)
export type SetKind = 'package' | 'lot' | 'heading' | 'fund';
export type SetRole = 'header' | 'part' | 'member';
export const setRoles: Record<SetRole, string> = { header: 'หัวชุด', part: 'ชิ้นส่วนในชุด', member: 'รายการในชุด' };
export type CandidateSet = { key: string; name: string; kind: SetKind; role?: SetRole };
// fund = หัวทุนที่อยู่เหนือแถวนี้ในไฟล์ต้นฉบับ: เป็นแค่ "รายการแนะนำ" เจ้าหน้าที่ต้องยืนยันเองว่ามาจากทุนนั้นจริง
export type CandidateFund = { key: string; name: string };
// เจ้าหน้าที่เปลี่ยนประเภทแถวต้นฉบับเองในหน้านำเข้าแบบ Excel (ระบบเดาผิด): หัวทุน / บรรทัดต่อของหัวด้านบน / ครุภัณฑ์ / ข้าม
export type RowOverride = 'fund' | 'continue' | 'asset' | 'skip';
export const rowOverrideLabels: Record<RowOverride, string> = { fund: 'หัวทุน', continue: 'บรรทัดต่อของหัวด้านบน', asset: 'ครุภัณฑ์', skip: 'ไม่ใช่ครุภัณฑ์ (ข้าม)' };
export const isRowOverride = (value: unknown): value is RowOverride => typeof value === 'string' && Object.hasOwn(rowOverrideLabels, value);
export type Candidate = {key:string;sheet:string;row:number;kind:string;issue:string;issueType?:string;groupName:string;values:unknown[];asset:Partial<Asset>;set?:CandidateSet;fund?:CandidateFund;override?:RowOverride};
export type Source = {id:string;name:string;hash:string;sheets:{name:string;rows:{row:number;values:unknown[]}[]}[]};
export function satang(value: unknown): number {
  const text = String(value ?? '').replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error('กรุณากรอกจำนวนเงินไม่ติดลบ และทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole,part='']=text.split('.'); const n=Number(BigInt(whole)*100n+BigInt(part.padEnd(2,'0')));
  if(!Number.isSafeInteger(n)||n>100000000000000) throw Error('จำนวนเงินเกินขอบเขตที่รองรับ'); return n;
}
export function splitAmounts(quantity:number,total:number,take:number) {
  if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(take)||take<=0||take>=quantity||!Number.isSafeInteger(total)||total<0) throw Error('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1');
  const first=Number(BigInt(total)*BigInt(take)/BigInt(quantity)); return [first,total-first];
}
export function expandRange(code:string,quantity:number): string[]|null {
  if(quantity!==2)return null;
  const m=code.replace(/\s+/g,'').match(/^(.*-)(\d+)\((\d+)\)ถึง-?(\d+)\(\3\)$/);
  if(!m||Number(m[4])!==Number(m[2])+1)return null;
  return [m[1]+m[2]+'('+m[3]+')',m[1]+m[4]+'('+m[3]+')'];
}
export function bookValue(a:Pick<Asset,'receivedDate'|'lifeYears'|'salvageSatang'|'totalSatang'>,at=new Date()):number|null {
  if(!a.receivedDate||!a.lifeYears)return null;
  const d=a.receivedDate.trim();
  const start=new Date(d+'T00:00:00Z');
  if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==d)return null;
  const days=Math.max(0,Math.floor((at.getTime()-start.getTime())/86400000));
  return Math.max(a.salvageSatang,a.totalSatang-Math.floor((a.totalSatang-a.salvageSatang)*Math.min(days/(a.lifeYears*365.25),1)));
}
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
// เลขที่คำขอ REQ-<ปีงบ>-<ลำดับ 4 หลัก> รันใหม่ทุกปีงบประมาณ
export const formatRequestNo = (fiscalYear: number, seq: number) => `REQ-${fiscalYear}-${String(seq).padStart(4, '0')}`;
type NumberedRequest = { id: string; createdAt: string; payload: string };
const storedSeq = (payload: string) => {
  try { const seq = (JSON.parse(payload || '{}') as { seq?: unknown }).seq; return Number.isSafeInteger(seq) && (seq as number) > 0 ? seq as number : null; }
  catch { return null; }
};
// ลำดับถัดไปของปีงบ: คำขอใหม่เก็บลำดับไว้ใน payload.seq ตอนยื่น (ใน transaction แบบ Serializable)
// คำขอเก่าที่ไม่มี seq นับตามลำดับเวลายื่น จึงใช้ค่ามากสุดระหว่าง "จำนวนคำขอในปี" กับ "seq มากสุด" กันเลขซ้ำ
export function nextRequestSeq(sameYear: readonly Pick<NumberedRequest, 'payload'>[]): number {
  return Math.max(sameYear.length, ...sameYear.map(r => storedSeq(r.payload) ?? 0)) + 1;
}
// เลขที่คำขอของทุกรายการ (id → REQ-2570-0001): ใช้ seq ที่บันทึกไว้ ถ้าเป็นคำขอเก่าใช้ลำดับตามเวลายื่นในปีงบเดียวกัน
export function requestNumbers(requests: readonly NumberedRequest[]): Map<string, string> {
  const out = new Map<string, string>(), rank = new Map<number, number>();
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const ordered = [...requests].sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  for (const r of ordered) {
    const year = thaiFiscalYear(r.createdAt), n = (rank.get(year) ?? 0) + 1;
    rank.set(year, n);
    out.set(r.id, formatRequestNo(year, storedSeq(r.payload) ?? n));
  }
  return out;
}
export const money=(n:number)=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
function cell(v:unknown):unknown {if(v&&typeof v==='object'&&'cached' in v)return (v as {cached:unknown}).cached;return v;}
function str(v:unknown){return String(cell(v)??'').trim();}
// ตัวเลขจากเซลล์ Excel: แปลงเลขไทย (๐–๙) และตัดเศษทศนิยมที่เกิดจากสูตร (เช่น 1260331.7999999998 → 1260331.80)
// ทศนิยมจริงเกิน 2 ตำแหน่ง (เช่น 6666.665) ไม่ปัด เพื่อให้เจ้าหน้าที่ตรวจเอง
function amount(v:unknown):unknown{
  const x=cell(v);
  if(typeof x==='number'&&Number.isFinite(x)&&Math.abs(x*100-Math.round(x*100))<1e-6)return (Math.round(x*100)/100).toFixed(2);
  if(typeof x==='string')return x.replace(/[๐-๙]/g,d=>String(d.charCodeAt(0)-0x0E50));
  return x;
}
// บอกปัญหาของช่องราคาให้ตรงเหตุ แทนข้อความรวมๆ
function satangSafe(v:unknown){try{satang(amount(v));return true;}catch{return false;}}
function priceProblem(v:unknown):string{
  const x=amount(v);
  if(v&&typeof v==='object'&&'formula' in (v as object)&&(x===null||x===undefined))return 'ช่องราคาเป็นสูตรที่ไม่มีค่าผลลัพธ์ ต้องเปิดไฟล์ใน Excel แล้วบันทึกใหม่';
  if(x===null||x===undefined||String(x).trim()==='')return 'ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';
  const n=Number(String(x).replace(/,/g,''));
  if(isNaN(n))return 'ช่องราคาไม่ใช่ตัวเลข: '+String(x).slice(0,30);
  if(n<0)return 'ราคาติดลบ ต้องตรวจสอบต้นฉบับ';
  if(Math.round(n*100)!==n*100)return 'ราคามีทศนิยมเกิน 2 ตำแหน่ง ('+String(x)+') ต้องปัดเป็นสตางค์ก่อนนำเข้า';
  return 'ข้อมูลราคาไม่ครบหรือไม่มีค่าผลลัพธ์สูตร';
}
type ImportColumns = { branch: number; group: number; category: number; location: number };
function tableHeader(values: unknown[]) {
  const labels = values.map(value => str(value).replace(/\s+/g, ''));
  // Recognize actual column labels, not those words occurring in an asset's notes.
  const header = headers11.slice(0, 7).every((label, index) => labels[index] === label);
  if (!header) return null;
  const branch = labels.indexOf('สาขา'), category = labels.indexOf('สำนักงาน');
  const group = labels.findIndex(label => ['หมวด(กลุ่มต่างๆ)', 'หมวด(กลุ่ม)', 'หมวด'].includes(label));
  const location = labels.indexOf('สถานที่');
  // Older source sheets have free-form project annotations after their seven core columns.
  const columns: ImportColumns | null = branch >= 7 && group >= 7 && category >= 7
    ? { branch, group, category, location } : null;
  return { columns };
}

export const standardCategories = [
  'คอมพิวเตอร์',
  'ไฟฟ้า',
  'เครื่องจักรกลเกษตร',
  'เครื่องกล',
  'อุตสาหการ',
  'โลจิสติกส์และโยธา',
  'เมคคาทรอนิกส์',
  'ออกแบบและสถาปัตย์',
  'สำนักงานส่วนกลาง'
] as const;

export type StandardCategory = typeof standardCategories[number];

// ประเภทครุภัณฑ์ (คอลัมน์ "สำนักงาน") ตามแถว "คณะวิศวกรรมศาสตร์ฯ ครุภัณฑ์…" ของแต่ละแผ่นในไฟล์ต้นฉบับของเจ้าหน้าที่
export const assetTypes = [
  'ครุภัณฑ์สำนักงาน',
  'ครุภัณฑ์คอมพิวเตอร์',
  'ครุภัณฑ์โฆษณาและเผยแพร่',
  'ครุภัณฑ์การแพทย์และวิทยาศาสตร์',
  'ครุภัณฑ์ไฟฟ้าและวิทยุ',
  'ครุภัณฑ์การศึกษา',
  'ครุภัณฑ์การเกษตร',
  'ครุภัณฑ์โรงงาน',
  'ครุภัณฑ์งานบ้านงานครัว',
  'ครุภัณฑ์สำรวจ',
  'ครุภัณฑ์ยานพาหนะและขนส่ง',
] as const;
export const UNKNOWN_ASSET_TYPE = 'รอระบุประเภท';

// ชื่อแผ่นงานในไฟล์ต้นฉบับ → ประเภท (ใช้เมื่อแผ่นไม่มีแถวหัว "ครุภัณฑ์…")
const assetTypeBySheet: Record<string, (typeof assetTypes)[number]> = {
  'สำนักงาน': 'ครุภัณฑ์สำนักงาน', 'คอม': 'ครุภัณฑ์คอมพิวเตอร์', 'โฆษณา': 'ครุภัณฑ์โฆษณาและเผยแพร่',
  'วิทยาศาสตร์': 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์', 'ไฟฟ้า': 'ครุภัณฑ์ไฟฟ้าและวิทยุ', 'การศึกษา': 'ครุภัณฑ์การศึกษา',
  'เกษตร': 'ครุภัณฑ์การเกษตร', 'โรงงาน': 'ครุภัณฑ์โรงงาน', 'งานครัว': 'ครุภัณฑ์งานบ้านงานครัว',
  'สำรวจ': 'ครุภัณฑ์สำรวจ', 'ยานพาหนะ': 'ครุภัณฑ์ยานพาหนะและขนส่ง',
};

// คืนประเภทที่ข้อความระบุ เช่น "คณะวิศวกรรมศาสตร์ฯ ครุภัณฑ์คอมพิวเตอร์" หรือชื่อแผ่น "คอม" ไม่รู้จัก → ''
export function assetTypeOf(text: string): string {
  const t = (text || '').replace(/\s+/g, '');
  if (!t) return '';
  if (assetTypeBySheet[t]) return assetTypeBySheet[t];
  return [...assetTypes].sort((a, b) => b.length - a.length).find(type => t.includes(type)) || '';
}

// หมวด (กลุ่มต่างๆ) = ชื่อแผ่นงานในไฟล์ต้นฉบับของเจ้าหน้าที่ เช่น สำนักงาน คอม ไฟฟ้า (ผู้ใช้ตัดสินใจ 16 ต.ค. 2569)
// คิดจากประเภทครุภัณฑ์เสมอ ไม่จัดจากชื่อรายการอีก (เลิกใช้ร่าง 19 หมวดย่อย)
export const UNGROUPED = 'รอจัดหมวด';
const groupByType: Record<string, string> = Object.fromEntries(Object.entries(assetTypeBySheet).map(([sheet, type]) => [type, sheet]));
export const assetGroups: readonly string[] = [...Object.keys(assetTypeBySheet), UNGROUPED];
export const isAssetGroup = (text: string) => assetGroups.includes((text || '').trim());
export function assetGroupOfType(category: string): string {
  const type = assetTypeOf(category) || assetTypeOf('ครุภัณฑ์' + (category || ''));
  return groupByType[type] || UNGROUPED;
}
export const groupFor = (a: { category?: string }) => assetGroupOfType(a.category || '');
// ชื่อหมวดย่อยรุ่นก่อน (ที่ไฟล์ Export รุ่นเก่ามีในคอลัมน์หมวด) นำเข้าแล้วทิ้ง ไม่ย้ายไปหมายเหตุ
const legacyGroupNames = new Set(['อุปกรณ์เครือข่ายและเครื่องแม่ข่าย', 'ชุดฝึกและชุดทดลอง', 'ยานพาหนะ', 'เครื่องมือวัดและทดสอบ',
  'เครื่องจักรและเครื่องมือช่าง', 'เครื่องใช้ไฟฟ้าในสำนักงานและงานครัว', 'โต๊ะ', 'เก้าอี้และโซฟา', 'ตู้และชั้นวาง', 'ซอฟต์แวร์',
  'เครื่องพิมพ์และสแกนเนอร์', 'คอมพิวเตอร์และโน้ตบุ๊ก', 'จอภาพ โปรเจคเตอร์ และจอรับภาพ', 'เครื่องเสียงและไมโครโฟน',
  'เครื่องปรับอากาศและพัดลม', 'อุปกรณ์ไฟฟ้าและเครื่องสำรองไฟ', 'ม่าน พาร์ติชั่น และอุปกรณ์อาคาร', 'อุปกรณ์ความปลอดภัย', 'อุปกรณ์การเกษตร']);

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

export type StandardBranch = typeof standardBranches[number];
export const OFFICE_BRANCH: StandardBranch = 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
// หน่วยงานที่ไม่ใช่สาขาวิชา (ฟอร์มแยกเป็นกลุ่ม "หน่วยงาน" ในรายการเลือก) ที่เหลือคือสาขาวิชา
export const officeBranches: readonly StandardBranch[] = [OFFICE_BRANCH];
export const academicBranches = standardBranches.filter(b => !officeBranches.includes(b));
export const isStandardBranch = (value: string): value is StandardBranch => (standardBranches as readonly string[]).includes(value);

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
  return categoryByStandardBranch[normalizeBranch(branch || '', '', '') as StandardBranch] ?? 'สำนักงานส่วนกลาง';
}

// แปลงข้อความสาขาในไฟล์ (ตัวย่อ ชื่อเต็ม หรือชื่อสาขารุ่นเก่าในฐานข้อมูล) เป็นสาขามาตรฐาน
// ไม่เดาสาขาจากชื่อแผ่นงาน เพราะแผ่นงานคือประเภทครุภัณฑ์ (แผ่น "คอม" มีคอมพิวเตอร์ของทุกสาขา)
export function normalizeBranch(raw: string, note: string, _sheet: string): string {
  // Prefer an explicit department over incidental department names in the notes.
  const identify = (text: string): string | undefined => {
    const alias = (codes: string) => new RegExp('(^|[^\\p{L}\\p{N}])(' + codes + ')(?=$|[^\\p{L}\\p{N}])', 'u').test(text);
    if (alias('วคม|วศค|มค') || /เครื่องกล|เมคคา|หุ่นยนต์/.test(text)) return 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)';
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
  return branchAbbreviation[normalizeBranch(raw, '', '') as StandardBranch] ?? raw;
}

// สาขามาตรฐานทั้งหมดที่ช่องสาขาระบุไว้ เช่น "วอ /คจก" ได้ 2 สาขา — มากกว่า 1 ต้องให้เจ้าหน้าที่เลือก ไม่เดา
export function branchCandidates(raw: string): StandardBranch[] {
  const text = (raw || '').trim();
  const standard = standardBranches as readonly string[];
  if (standard.includes(text)) return [text as StandardBranch];
  const found = new Set<StandardBranch>();
  for (const part of text.split('/')) {
    const branch = part.trim() && normalizeBranch(part.trim(), '', '');
    if (branch && standard.includes(branch)) found.add(branch as StandardBranch);
  }
  return [...found];
}
// แถวในไฟล์ที่หมายเลขมีในทะเบียนอยู่แล้ว (จากไฟล์อื่นหรือเพิ่มเอง) ต้องไม่ขึ้นว่า "พร้อมนำเข้า"
// existing: codeKey → คำอธิบายรายการเดิม · ข้ามแถวที่นำเข้าจากไฟล์นี้ไปแล้ว (done)
export function markExistingCodes(rows: Candidate[], existing: Map<string, string>, done: Set<string>): Candidate[] {
  for (const row of rows) {
    if (row.kind !== 'asset' || done.has(row.key)) continue;
    // รหัสช่วง ("…-1(1) ถึง -2(1)") นำเข้าเป็นรหัสย่อยแต่ละตัวด้วย จึงต้องเทียบรหัสย่อยกับทะเบียนด้วย
    const code = String(row.asset.code || '');
    const hit = [code, ...(expandRange(code, Number(row.asset.quantity)) ?? [])].map(c => existing.get(codeKey(c))).find(Boolean);
    if (!hit) continue;
    const note = 'มีหมายเลขนี้ในทะเบียนแล้ว: ' + hit;
    row.issue = row.issue ? note + ' · ' + row.issue : note;
    row.issueType = 'duplicate';
  }
  return rows;
}
// หมายเลขครุภัณฑ์ที่ถือว่าเป็นตัวเดียวกัน: ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง (เช่น "ksu165 -1610" = "KSU165-1610")
// สายอนุมัติจากค่าตั้ง: ต้องมี 1–3 ขั้น ไม่ซ้ำ และเป็น head/deputy/dean เท่านั้น
// ค่าที่เสีย (เช่น "[]") ใช้ค่าเริ่มต้น ไม่งั้นคำขอใหม่จะไม่มีผู้อนุมัติและค้างตลอดไป
export const DEFAULT_APPROVAL_CHAIN = ['head', 'deputy', 'dean'] as const;
export function approvalChainOf(value?: string | null): { chain: string[]; valid: boolean } {
  try {
    const chain = JSON.parse(value || '');
    if (Array.isArray(chain) && chain.length >= 1 && chain.length <= 3 && new Set(chain).size === chain.length
      && chain.every(r => r === 'head' || r === 'deputy' || r === 'dean')) return { chain, valid: true };
  } catch { /* ค่าที่ไม่ใช่ JSON ใช้ค่าเริ่มต้น */ }
  return { chain: [...DEFAULT_APPROVAL_CHAIN], valid: false };
}
// ป้าย "รออนุมัติ…" ของครุภัณฑ์ที่มีคำขอค้างอยู่ (ผู้ใช้เลือก 18 ต.ค. 2569) แสดงแทนสภาพระหว่างรออนุมัติเท่านั้น
// สภาพในฐานข้อมูลไม่เปลี่ยนจนกว่าจะอนุมัติครบ ถ้าไม่อนุมัติ ป้ายหายเองและกลับเป็นสภาพเดิม
export const awaitingLabels: Record<string, string> = { repair: 'รออนุมัติซ่อม', transfer: 'รออนุมัติโอนย้าย', disposal: 'รออนุมัติจำหน่าย' };
export type AwaitingApproval = { label: string; detail: string };
export function awaitingApprovalByAsset(
  requests: readonly { assetId: string; kind: string; status: string; stage: number; chain: string; payload: string; requestNo?: string }[],
  assets: readonly { id: string; setId?: string | null }[]
): Map<string, AwaitingApproval> {
  const out = new Map<string, AwaitingApproval>();
  for (const r of requests) {
    if (r.status !== 'pending') continue;
    let chain: string[] = [...DEFAULT_APPROVAL_CHAIN], payload: { setId?: unknown } = {};
    try { chain = JSON.parse(r.chain); } catch { /* ใช้สายอนุมัติเริ่มต้น */ }
    try { payload = JSON.parse(r.payload || '{}'); } catch { /* ไม่มีรายละเอียด */ }
    const waiting = (roles[chain[r.stage] as Role] ?? chain[r.stage] ?? '').replace(/ \(.*\)$/, '');
    const info = { label: awaitingLabels[r.kind] ?? 'รออนุมัติ', detail: [r.requestNo, `รอ${waiting} (ขั้น ${r.stage + 1}/${chain.length})`].filter(Boolean).join(' · ') };
    // โอนย้าย/จำหน่ายของชุดมีผลทั้งชุดเมื่ออนุมัติ จึงติดป้ายทุกรายการในชุด
    const members = payload.setId && (r.kind === 'transfer' || r.kind === 'disposal') ? assets.filter(a => a.setId === payload.setId).map(a => a.id) : [];
    for (const id of [r.assetId, ...members]) if (!out.has(id)) out.set(id, info);
  }
  return out;
}
// คำขอนี้รอผู้ใช้คนนี้อนุมัติอยู่หรือไม่ (ใช้ทั้งหน้าคำขอและกระดิ่งแจ้งเตือน ให้นับตรงกัน)
// ขั้นของหัวหน้าสาขา: ต้องเป็นสาขาเดียวกับครุภัณฑ์ · ห้ามอนุมัติคำขอของตัวเอง
export function awaitsApprovalBy(r: { status: string; chain: string; stage: number; actor: string }, me: { id: string; role: string; branch?: string | null }, assetBranch?: string | null): boolean {
  if (r.status !== 'pending' || r.actor === me.id) return false;
  // บัญชีผู้ทดสอบ (ผู้ใช้ตัดสินใจ 18 ต.ค. 2569): อนุมัติได้ทุกคำขอทุกสาขา กดครั้งเดียวจบทุกขั้นที่เหลือ
  if (me.role === 'tester') return true;
  let chain: string[] = ['head', 'deputy', 'dean'];
  try { chain = JSON.parse(r.chain); } catch { /* ใช้สายอนุมัติเริ่มต้น */ }
  const stageRole = chain[r.stage];
  if (stageRole !== me.role) return false;
  if (stageRole !== 'head') return true;
  return !!me.branch && !!assetBranch && normalizeBranch(me.branch, '', '') === normalizeBranch(assetBranch, '', '');
}
export const codeKey = (code: string) => (code || '').normalize('NFC').toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
export function classify(source:Source, overrides: Record<string, RowOverride> = {}):Candidate[]{
 const out:Candidate[]=[];
 const codeCounts = new Map<string, number>();
 const codeHistorical = new Set<string>();
 // ประเภทของแต่ละแผ่น: จากแถว "คณะวิศวกรรมศาสตร์ฯ ครุภัณฑ์…" ก่อน ไม่มีจึงใช้ชื่อแผ่น
 const sheetTypes = new Map<string, string>(), codeTypes = new Map<string, string>();
 for(const sh of source.sheets){
  const isHist = /ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sh.name);
  const headingRow = sh.rows.find(r => /^คณะวิศวกรรม/.test(r.values.slice(0, 3).map(str).find(Boolean) || ''));
  const headingType = headingRow ? assetTypeOf(headingRow.values.slice(0, 3).map(str).find(Boolean) || '') : '';
  // แผ่น "ไม่มีตัวตน" ในต้นฉบับใช้หัว "ครุภัณฑ์สำรวจ" ที่ไม่ตรงกับรายการ จึงไม่เชื่อหัวของแผ่นนี้
  sheetTypes.set(sh.name, /ไม่มีตัวตน/.test(sh.name) ? '' : headingType || assetTypeOf(sh.name));
  for(const r of sh.rows){
   const c = codeKey(str(r.values[1]));
   if(c){
    codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
    if(isHist) codeHistorical.add(c);
    else if(sheetTypes.get(sh.name) && !codeTypes.has(c)) codeTypes.set(c, sheetTypes.get(sh.name)!);
   }
  }
 }
 for(const sheet of source.sheets){
  let group='';const historical=/ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sheet.name);let columns:ImportColumns|null=null;
  for(const r of sheet.rows){
   const v=r.values;const text=v.map(str).filter(Boolean).join(' | ');const name=str(v[2]);const code=str(v[1]);
   let kind='note',issue='',issueType='other';
   const header=tableHeader(v);
   const subtotalLabel=(value:unknown)=>/^(?:ยอดยกไป|ยอดยกมา|รวมทั้งสิ้น|รวมเป็นเงิน|รวม)(?:\s|$)/.test(str(value));
   const heading=v.slice(0,3).map(str).find(Boolean)||'';
   if(header){kind='header';columns=header.columns;}
   // Report annotations occupy the leading cells. A normal asset's name/notes may
   // legitimately contain words such as เจ้าหน้าที่ or รวมเป็นเงิน.
   else if((!name||!code||subtotalLabel(code))&&v.slice(0,5).some(subtotalLabel))kind='subtotal';
   else if((!name||!code)&&/^(?:หน้าที่\s*\d|รายละเอียดครุภัณฑ์(?:คงเหลือ|ชำรุด)|มหาวิทยาลัย|ณ\s*วันที่|ประจำปีงบประมาณ|คณะวิศวกรรม)/.test(heading))kind='header';
   else if(name && code && Number(amount(v[3]))>0){kind='asset';}
   else if(name&&code&&str(v[3])!==''&&Number(amount(v[3]))<=0){kind='asset';issue='จำนวนต้องมากกว่า 0 ต้องตรวจสอบต้นฉบับ';issueType='price';}
   else if(name&&code){kind='asset';issue='จำนวนหรือราคาของรายการย่อยยังไม่ครบ ต้องระบุวิธีลงมูลค่าชุด';issueType='price';}
   else if(!name&&/\d{2,}[-/]/.test(code)){kind='asset';issue='ชื่อหรือข้อมูลรายการที่รวมเซลล์ยังไม่ครบ ต้องตรวจสอบต้นฉบับ';issueType='name';}
   // มีหมายเลขแต่ไม่มีชื่อ: ข้อความที่มีตัวเลขและไม่มีสระ/วรรณยุกต์ไทยคือรหัส ไม่ใช่ชื่อชุด (ชื่อชุดจริงมีสระเสมอ)
   else if(!name&&/\d/.test(code)&&!/[ัิ-ฺเ-๎]/.test(code)&&Number(amount(v[3]))>0){kind='asset';issue='มีหมายเลขครุภัณฑ์แต่ไม่มีชื่อรายการ ต้องเติมชื่อก่อนนำเข้า';issueType='name';}
   else if(!name&&code){kind='group';group=text;}
   else if(/ชุด|โครงการ|สัญญา|งบประมาณ|ประกอบด้วย|ทดแทน/.test(text)){kind='group';group=text;}
   // บรรทัดราคาของชุดที่ไม่มีรหัส (มีชื่อ จำนวน และราคา) เช่น "โต๊ะประชุมมีบังตา | 2 | 5,900 | 11,800" แล้วตามด้วยรายชิ้นที่ไม่มีราคา
   // ต้องไม่ถูกทิ้งเป็นหมายเหตุ ไม่งั้นยอดเงินหายและรายชิ้นไปเข้าชุดก่อนหน้า → ส่งต่อให้ detectSets ทำเป็นหัวชุด
   else if(!code&&name&&Number(amount(v[3]))>0&&Number(String(amount(v[4])??'').replace(/,/g,''))>0){kind='group';}
   const override = overrides[sheet.name+':'+r.row];
   if(override==='skip'||override==='continue'){kind='note';issue='';}
   else if(override==='fund'){kind='group';group=text;}
   else if(override==='asset'&&kind!=='asset'){kind='asset';issue='เจ้าหน้าที่เปลี่ยนเป็นครุภัณฑ์ ต้องตรวจรหัส ชื่อ จำนวน และราคา';issueType='name';}
   let qty=Number(amount(v[3])),unit=0,total=0;
   let explicitCat = '';
   let memo = '';
   let rawGroup = '';
   if (columns) {
     const vGroup = str(v[columns.group]);
     rawGroup = vGroup;
     const vOffice = columns.category >= 0 ? str(v[columns.category]) : '';
     if (standardCategories.includes(vGroup as any)) {
       // ไฟล์ที่ Export จากเว็บรุ่นก่อน: หมวดหมู่ตามสาขาอยู่ในคอลัมน์หมวด
       explicitCat = vGroup;
     } else {
       // คอลัมน์ "หมวด" รับเฉพาะหมวดที่รู้จัก และ "สำนักงาน" รับเฉพาะประเภทครุภัณฑ์
       // ข้อความอื่นเป็นบันทึกช่วยจำของเจ้าหน้าที่ → ย้ายไปหมายเหตุ
       // "รอจัดหมวด" / "รอระบุประเภท" เป็นแค่ป้ายบอกว่ายังไม่ได้จัด ไม่ใช่ข้อมูล
       explicitCat = assetTypeOf(vOffice);
       const placeholder = (x: string) => !x || /^(?:ทั่วไป|—|-)$/.test(x) || x === UNGROUPED || x === UNKNOWN_ASSET_TYPE;
       // บันทึกช่วยจำที่อยู่ถัดจากคอลัมน์สำนักงาน (เช่นไฟล์ที่จัดข้อมูลแล้วย้ายบันทึกไปช่อง K เป็นต้นไป) ต้องไม่หาย
       const last = Math.max(columns.group, columns.category, columns.branch);
       const extra = v.slice(last + 1).map(str);
       const memos = [isAssetGroup(vGroup) || legacyGroupNames.has(vGroup) ? '' : vGroup, explicitCat ? '' : vOffice, ...extra].filter(x => !placeholder(x));
       memo = memos.join(' · ');
     }
   }
   // ข้อความชุด/โครงการเก็บแยกในชุด (detectSets) และใน groupName ของแถว (หมวดคิดจากประเภทด้านล่าง)
   const groupName = columns ? rawGroup : [group, ...v.slice(8).map(str)].filter(Boolean).join(' • ');
   const rawBranch = columns ? str(v[columns.branch]) : (str(v[7]) || str(v[8]));
   const branch = normalizeBranch(rawBranch, str(v[6]), sheet.name);
   // ชีตชำรุด/ประวัติไม่บอกประเภท จึงใช้ประเภทของรหัสเดียวกันในแผ่นหลัก
   const category = explicitCat || (historical ? codeTypes.get(codeKey(code)) || sheetTypes.get(sheet.name) : sheetTypes.get(sheet.name)) || UNKNOWN_ASSET_TYPE;
   const assetGroup = assetGroupOfType(category);
   const notes = [str(v[6]), memo].filter(Boolean).join(' · ');
   if(kind==='asset'){
    try{unit=satang(amount(v[4]));total=satang(amount(v[5]));}catch{issue ||= priceProblem(satangSafe(v[4])?v[5]:v[4]);issueType='price';}
    if(!Number.isSafeInteger(qty)||qty<=0){qty=0;issue ||= 'ตรวจสอบจำนวนรายการ';}
    if(qty&&unit*qty!==total){issue ||= 'จำนวน × ราคาต่อหน่วยไม่ตรงยอดเดิม';if(issueType==='other')issueType='price';}
    if(codeHistorical.has(codeKey(code))&&!historical){issue ||= 'รหัสนี้มีอยู่ในชีตชำรุด/ประวัติ อาจแทงจำหน่ายแล้ว';issueType='duplicate';}
    else if((codeCounts.get(codeKey(code))||0)>1){issue ||= 'รหัสครุภัณฑ์ซ้ำซ้อนในไฟล์';issueType='duplicate';}
    else if(historical){issue ||= 'ชีตประวัติ / ชำรุด ต้องตรวจสอบรายการซ้ำกับทะเบียนหลัก';issueType='duplicate';}
    if(/ถึง/.test(code)||/\(\d+-\d+\)/.test(code)){issue ||= 'ช่วงรหัสไม่ชัดเจน ต้องตรวจสอบหมายเลขรายชิ้น';issueType='range';}
    if(group && (!unit || !total || unit*qty !== total)){issue ||= 'รายการอยู่ในชุด / โครงการ ต้องยืนยันการจัดกลุ่มและการลงมูลค่า';if(issueType==='other')issueType='price';}
    if(!unit&&!total&&!issue){issue='ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';issueType='price';}
    // ข้อความยาวเกินที่ระบบรับได้: ถ้าปล่อยเป็น "พร้อมนำเข้า" การนำเข้าทั้งชุดจะล้มเพราะแถวเดียว
    if([code,name,str(v[6])].some(t=>t.length>5000)){issue ||= 'ข้อความในแถวยาวเกิน 5,000 ตัวอักษร ต้องย่อก่อนนำเข้า';issueType='name';}
    const branches=branchCandidates(rawBranch);
    if(branches.length>1){const note=`ระบุไว้หลายสาขา (${branches.map(branchAbbr).join(' / ')}) ต้องเลือกสาขาก่อนนำเข้า`;if(issue)issue+=' · '+note;else{issue=note;issueType='branch';}}
    if(!issue)issueType='ready';
   }
   out.push({key:sheet.name+':'+r.row,sheet:sheet.name,row:r.row,kind,issue,issueType,groupName,values:v,...(override?{override}:{}),asset:{code,name:name||(override==='asset'?v.map(str).filter(Boolean).join(' '):''),quantity:qty||0,unitSatang:unit,totalSatang:total,notes,location:columns&&columns.location>=0?str(v[columns.location]):str(v[6]),branch,groupName:assetGroup,category,condition:'normal'}});
  }
 }return detectSets(out);
}

// ช่องราคาที่ว่างจริง (ไม่ใช่ 0) — ชิ้นส่วนของชุดในไฟล์ต้นฉบับเว้นช่องราคาไว้ ส่วนราคา 0 คือรายการที่ลงราคาเป็นศูนย์
function priceIsBlank(value: unknown): boolean {
  const v = amount(value);
  if (v === null || v === undefined) return true;
  const text = String(v).replace(/,/g, '').trim();
  return !text || isNaN(Number(text));
}

// จัดชุดครุภัณฑ์จากลำดับแถวในแต่ละแผ่น (ผู้ใช้ยืนยัน 13 ต.ค. 2569):
// - หัวชุดไม่มีลำดับแต่มีราคา (package) และรายการมีลำดับที่มีราคา (lot) ตามด้วยแถวมีลำดับที่เว้นช่องราคา = ชิ้นส่วน มูลค่ารวมในหัวชุด
//   ชุดจบเมื่อเจอรายการที่มีราคาของตัวเอง
// - หัวข้อชุดไม่มีราคา (heading) = รายการมีราคาที่ตามมาอยู่ในชุดเดียวกัน จนเจอหัวชุดหรือหัวข้อใหม่
// - หัวชุด package ไม่มีหมายเลข จึงใช้หมายเลขของชิ้นส่วน และต่อท้ายชิ้นส่วนที่ใช้เลขเดียวกันด้วย -ชิ้น1, -ชิ้น2 …
function detectSets(rows: Candidate[]): Candidate[] {
  const sheets = new Map<string, Candidate[]>();
  for (const row of rows) { if (!sheets.has(row.sheet)) sheets.set(row.sheet, []); sheets.get(row.sheet)!.push(row); }
  const reviewSet = (row: Candidate, note: string) => { row.issue = note; row.issueType = 'set'; };
  for (const sheetRows of sheets.values()) {
    let heading: CandidateSet | null = null;
    let lastPriced: Candidate | null = null;
    let lastCounted: Candidate | null = null;
    const packages: Array<{ header: Candidate; parts: Candidate[] }> = [];
    let currentPackage: { header: Candidate; parts: Candidate[] } | null = null;
    for (const row of sheetRows) {
      if (row.override === 'continue') {
        // บรรทัดต่อ (เจ้าหน้าที่ระบุ): ข้อความต่อท้ายหัวทุน/หัวชุด/ชื่อรายการด้านบน
        const more = row.values.map(str).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (more && lastCounted?.kind === 'group' && heading) heading.name += ' ' + more;
        else if (more && lastCounted?.kind === 'asset') {
          if (lastCounted.set?.role === 'header') lastCounted.set.name += ' ' + more;
          lastCounted.asset = { ...lastCounted.asset, name: ((lastCounted.asset.name || '') + ' ' + more).trim() };
        }
        continue;
      }
      if (row.kind === 'header' || row.kind === 'subtotal' || row.kind === 'note') continue;   // หัวกระดาษแต่ละหน้าไม่ตัดชุด
      const v = row.values, seq = Number(cell(v[0]));
      const hasSeq = Number.isInteger(seq) && seq > 0 && String(cell(v[0]) ?? '').trim() !== '';
      if (row.kind === 'group') {
        const text = row.override === 'fund' ? v.map(str).filter(Boolean).join(' ').replace(/\s+/g, ' ') : str(v[1]) || str(v[2]) || row.groupName;
        if (row.override !== 'fund' && !priceIsBlank(v[4]) && Number(amount(v[3])) > 0) {
          // หัวชุด package: มีราคา ไม่มีลำดับ → เป็นครุภัณฑ์ที่ถือมูลค่าของทั้งชุด
          const set: CandidateSet = { key: row.key, name: text, kind: 'package', role: 'header' };
          let unit = 0, total = 0;
          try { unit = satang(amount(v[4])); total = satang(amount(v[5])); } catch { /* ราคาผิดรูปแบบ: ให้เจ้าหน้าที่ตรวจ */ }
          row.kind = 'asset';
          row.set = set;
          row.asset = { ...row.asset, code: '', name: text, quantity: Number(amount(v[3])), unitSatang: unit, totalSatang: total };
          reviewSet(row, `หัวชุด "${text}" มูลค่ารวมของทั้งชุด ตรวจการจัดชุดก่อนนำเข้า`);
          currentPackage = { header: row, parts: [] };
          packages.push(currentPackage);
          if (heading) row.fund = { key: heading.key, name: heading.name };
          lastPriced = row; heading = null; lastCounted = row;
          continue;
        }
        if (lastCounted && lastCounted.kind === 'group' && lastCounted.set?.kind === 'heading' && heading) {
          heading.name += ' ' + text;                                                 // หัวข้อชุดที่เขียนต่อหลายบรรทัด
        } else {
          heading = { key: row.key, name: text, kind: 'heading' };
          lastPriced = null; currentPackage = null;
        }
        row.set = heading;
        lastCounted = row;
        continue;
      }
      if (row.kind !== 'asset') continue;
      lastCounted = row;
      if (heading) row.fund = { key: heading.key, name: heading.name };
      if (hasSeq && priceIsBlank(v[4]) && lastPriced && row.asset.name) {
        // ชิ้นส่วนของหัวชุดก่อนหน้า
        if (!lastPriced.set) {
          const setName = lastPriced.asset.name || lastPriced.asset.code || '';
          lastPriced.set = { key: lastPriced.key, name: setName, kind: 'lot', role: 'header' };
          const extra = lastPriced.issue && lastPriced.issueType !== 'ready' ? ' · ' + lastPriced.issue : '';
          reviewSet(lastPriced, `หัวชุด "${setName}" มีชิ้นส่วนรวมในชุด ตรวจการจัดชุดก่อนนำเข้า${extra}`);
          currentPackage = { header: lastPriced, parts: [] };
        }
        const headerSet = lastPriced.set!;
        row.set = { key: headerSet.key, name: headerSet.name, kind: headerSet.kind, role: 'part' };
        row.asset = { ...row.asset, quantity: row.asset.quantity || 1, unitSatang: 0, totalSatang: 0 };
        reviewSet(row, `ชิ้นส่วนของชุด "${headerSet.name}" มูลค่ารวมในหัวชุดแล้ว ตรวจการจัดชุดก่อนนำเข้า`);
        if (currentPackage && currentPackage.header === lastPriced) currentPackage.parts.push(row);
        continue;
      }
      // รายการที่มีราคาของตัวเอง: จบชุดแบบ package/lot ส่วนหัวข้อชุดยังต่อเนื่อง
      currentPackage = null;
      lastPriced = row;
    }
    // หมายเลขของหัวชุด package มาจากชิ้นส่วน (เลือกข้อ ก.)
    for (const { header, parts } of packages) {
      const code = parts.map(p => p.asset.code).find(Boolean) || '';
      header.asset.code = code;
      if (!code) reviewSet(header, `หัวชุด "${header.set!.name}" ไม่มีหมายเลขครุภัณฑ์ ต้องระบุก่อนนำเข้า`);
      let n = 0;
      for (const part of parts) if (code && part.asset.code === code) part.asset.code = `${code}-ชิ้น${++n}`;
    }
  }
  // หัวทุนที่ต่อหลายบรรทัด: ให้ทุกรายการใช้ชื่อเต็มเดียวกัน
  const headings = new Map(rows.filter(r => r.kind === 'group' && r.set?.kind === 'heading').map(r => [r.key, r.set!.name]));
  for (const row of rows) if (row.fund && headings.has(row.fund.key)) row.fund = { ...row.fund, name: headings.get(row.fund.key)! };
  return rows;
}

// ผลต่างการตรวจนับ: เทียบจำนวนที่พบจริงกับจำนวนในทะเบียน ณ วันเปิดรอบ (ขาด / เกิน / ตรง / ยังไม่ได้ตรวจ)
export type StocktakeDifference = { kind: 'unchecked' | 'match' | 'short' | 'over'; amount: number };
export function stocktakeDifference(expected: number, found: number | null | undefined): StocktakeDifference {
  if (found === null || found === undefined) return { kind: 'unchecked', amount: 0 };
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(found) || expected < 0 || found < 0) throw Error('จำนวนตรวจนับต้องเป็นจำนวนเต็มไม่ติดลบ');
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

// อายุการใช้งานคงเหลือ (ปี) ใช้ฐานวันเดียวกับ bookValue (1 ปี = 365.25 วัน) คืน null ถ้าไม่มีวันรับหรืออายุใช้งาน
function elapsedDays(receivedDate: string, at: Date): number | null {
  const d = (receivedDate || '').trim();
  if (!d) return null;
  const start = new Date(d + 'T00:00:00Z');
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== d) return null;
  return Math.max(0, Math.floor((at.getTime() - start.getTime()) / 86400000));
}
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
  over3: 'เหลือมากกว่า 3 ปี'
};
export function lifeBucket(a: Pick<Asset, 'receivedDate' | 'lifeYears'>, at = new Date()): LifeBucket {
  const r = remainingLifeYears(a, at);
  if (r === null) return 'unknown';
  if (r === 0) return 'expired';
  if (r <= 1) return 'within1';
  if (r <= 3) return 'within3';
  return 'over3';
}

// วันที่แบบ ISO (yyyy-mm-dd) -> "1 ต.ค. 2569" (พ.ศ.) ถ้าไม่ใช่วันที่จริงคืนข้อความเดิม
const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function thaiDateOnly(iso: string): string {
  const d = (iso || '').trim();
  const start = new Date(d + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== d) return iso;
  return `${start.getUTCDate()} ${thaiMonthsShort[start.getUTCMonth()]} ${start.getUTCFullYear() + 543}`;
}
