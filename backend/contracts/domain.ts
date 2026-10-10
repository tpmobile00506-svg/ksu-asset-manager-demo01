export const roles = {staff:'เจ้าหน้าที่พัสดุ (Staff)',head:'หัวหน้าสาขา (Head)',deputy:'รองคณบดี (Deputy)',dean:'คณบดี (Dean)',admin:'ผู้ดูแลระบบ (Admin)'} as const;
export type Role = keyof typeof roles;
export const conditions = {normal:'ปกติ',damaged:'ชำรุด',repair:'กำลังซ่อม',missing:'ไม่พบ'} as const;
export const requestTypes = {transfer:'โอนย้าย',repair:'ซ่อมบำรุง',disposal:'จำหน่าย / ตัดบัญชี'} as const;
export const headers11 = ['ลำดับ','หมายเลขครุภัณฑ์','รายการ','จำนวน','ราคาต่อหน่วย','จำนวนเงิน','หมายเหตุ','สถานที่','สาขา','หมวด (กลุ่มต่างๆ)','สำนักงาน'];
export type Asset = {imageVersion?:string|null;imageUrl?:string|null;id:string;code:string;name:string;quantity:number;unitSatang:number;totalSatang:number;notes:string;location:string;branch:string;groupName:string;category:string;condition:string;lifecycle:string;version:number;parentId:string|null;sourceId:string|null;sourceRow:string|null;receivedDate:string;lifeYears:number;salvageSatang:number;serial:string;brand:string;custodian:string;createdAt:string};
export type Candidate = {key:string;sheet:string;row:number;kind:string;issue:string;issueType?:string;groupName:string;values:unknown[];asset:Partial<Asset>};
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
export const money=(n:number)=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
function cell(v:unknown):unknown {if(v&&typeof v==='object'&&'cached' in v)return (v as {cached:unknown}).cached;return v;}
function str(v:unknown){return String(cell(v)??'').trim();}
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

export const standardBranches = [
  'วิศวกรรมคอมพิวเตอร์ (วค)',
  'วิศวกรรมไฟฟ้า (วฟ)',
  'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)',
  'วิศวกรรมเครื่องกล (วคม/วศค)',
  'วิศวกรรมอุตสาหการ (วอ)',
  'วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)',
  'วิศวกรรมเมคคาทรอนิกส์ (มค)',
  'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)',
  'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)',
  'ส่วนกลาง / การศึกษา'
] as const;

export type StandardBranch = typeof standardBranches[number];

// หมวดหมู่ของสาขามาตรฐานทั้ง 10 (จับคู่ตรงตัว กันกรณีตัวย่อซ้อนกัน เช่น "ควอ" มี "วอ", "วคม" มี "วค")
const categoryByStandardBranch: Record<(typeof standardBranches)[number], (typeof standardCategories)[number]> = {
  'วิศวกรรมคอมพิวเตอร์ (วค)': 'คอมพิวเตอร์',
  'วิศวกรรมไฟฟ้า (วฟ)': 'ไฟฟ้า',
  'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)': 'เครื่องจักรกลเกษตร',
  'วิศวกรรมเครื่องกล (วคม/วศค)': 'เครื่องกล',
  'วิศวกรรมอุตสาหการ (วอ)': 'อุตสาหการ',
  'วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)': 'โลจิสติกส์และโยธา',
  'วิศวกรรมเมคคาทรอนิกส์ (มค)': 'เมคคาทรอนิกส์',
  'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)': 'ออกแบบและสถาปัตย์',
  'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)': 'สำนักงานส่วนกลาง',
  'ส่วนกลาง / การศึกษา': 'สำนักงานส่วนกลาง'
};

export function resolveCategory(branch: string, rawOffice?: string): string {
  const exact = categoryByStandardBranch[(branch || '').trim() as (typeof standardBranches)[number]];
  if (exact) return exact;
  const b = (branch || '').toLowerCase();
  if (b.includes('คอม') || b.includes('วค') || b.includes('it') || b.includes('computer')) return 'คอมพิวเตอร์';
  if (b.includes('ไฟฟ้า') || b.includes('วฟ') || b.includes('อิเล็ก') || b.includes('electrical')) return 'ไฟฟ้า';
  if (b.includes('เกษตร') || b.includes('คจก') || b.includes('จักรกลเกษตร')) return 'เครื่องจักรกลเกษตร';
  if (b.includes('เครื่องกล') || b.includes('วคม') || b.includes('วศค') || b.includes('ช่างกล') || b.includes('mechanical')) return 'เครื่องกล';
  if (b.includes('อุตสาหการ') || b.includes('วอ') || b.includes('การผลิต') || b.includes('โรงงาน') || b.includes('industrial')) return 'อุตสาหการ';
  if (b.includes('โลจิสติก') || b.includes('โยธา') || b.includes('วย') || b.includes('วล') || b.includes('civil') || b.includes('logistics')) return 'โลจิสติกส์และโยธา';
  if (b.includes('เมคคา') || b.includes('มค') || b.includes('หุ่นยนต์') || b.includes('mechatronics')) return 'เมคคาทรอนิกส์';
  if (b.includes('ออกแบบ') || b.includes('นอส') || b.includes('สถาปัตย์') || b.includes('design') || b.includes('arch')) return 'ออกแบบและสถาปัตย์';
  if (b.includes('สำนักงาน') || b.includes('ควอ') || b.includes('คณบดี') || b.includes('สนง') || b.includes('ส่วนกลาง') || b.includes('บริหาร')) return 'สำนักงานส่วนกลาง';

  if (rawOffice) {
    const o = rawOffice.toLowerCase();
    if (o.includes('คอม')) return 'คอมพิวเตอร์';
    if (o.includes('ไฟฟ้า')) return 'ไฟฟ้า';
    if (o.includes('เกษตร')) return 'เครื่องจักรกลเกษตร';
    if (o.includes('เครื่องกล') || o.includes('วศค')) return 'เครื่องกล';
    if (o.includes('อุตสาหการ')) return 'อุตสาหการ';
  }
  return 'สำนักงานส่วนกลาง';
}

export function normalizeBranch(raw: string, note: string, sheet: string): string {
  // Prefer an explicit department over incidental department names in the notes.
  const identify = (text: string): string | undefined => {
    const alias = (codes: string) => new RegExp('(^|[^\\p{L}\\p{N}])(' + codes + ')(?=$|[^\\p{L}\\p{N}])', 'u').test(text);
    if (alias('วคม|วศค') || /เครื่องกล/.test(text)) return 'วิศวกรรมเครื่องกล (วคม/วศค)';
    if (alias('สนง|สนอ|ควอ') || /สโมสร|คณบดี/.test(text)) return 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
    if (alias('วฟ') || /ไฟฟ้า/.test(text)) return 'วิศวกรรมไฟฟ้า (วฟ)';
    if (alias('วค') || /คอม/.test(text)) return 'วิศวกรรมคอมพิวเตอร์ (วค)';
    if (alias('วอ') || /อุตสาหการ|การผลิต|ช่างกล/.test(text)) return 'วิศวกรรมอุตสาหการ (วอ)';
    if (alias('วย|วล') || /โลจิสติก|โยธา/.test(text)) return 'วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)';
    if (alias('คจก') || /เกษตร/.test(text)) return 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)';
    if (alias('มค') || /เมคคา|หุ่นยนต์/.test(text)) return 'วิศวกรรมเมคคาทรอนิกส์ (มค)';
    if (alias('นอส') || /ออกแบบ|ออบแบบ|สถาปัตย์/.test(text)) return 'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)';
  };
  const explicit = raw.trim();
  if (explicit) return identify(explicit) || explicit;
  const inferred = identify(note);
  if (inferred) return inferred;
  if (sheet === 'คอม') return 'วิศวกรรมคอมพิวเตอร์ (วค)';
  if (sheet === 'ไฟฟ้า') return 'วิศวกรรมไฟฟ้า (วฟ)';
  if (sheet === 'เกษตร') return 'เทคโนโลยีเครื่องจักรกลเกษตร (คจก)';
  if (sheet === 'โรงงาน') return 'วิศวกรรมอุตสาหการ (วอ)';
  if (sheet === 'สำนักงาน') return 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
  if (sheet === 'สำรวจ' || sheet === 'ยานพาหนะ') return 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
  return 'ส่วนกลาง / การศึกษา';
}
export function classify(source:Source):Candidate[]{
 const out:Candidate[]=[];
 const codeCounts = new Map<string, number>();
 const codeHistorical = new Set<string>();
 for(const sh of source.sheets){
  const isHist = /ชำรุด|ไม่มีตัวตน|วัสดุฝึกสอน/.test(sh.name);
  for(const r of sh.rows){
   const c = str(r.values[1]);
   if(c){
    codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
    if(isHist) codeHistorical.add(c);
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
   else if((!name||!code)&&/^(?:หน้าที่\s*\d|รายละเอียดครุภัณฑ์คงเหลือ|มหาวิทยาลัย|ณ\s*วันที่|คณะวิศวกรรม)/.test(heading))kind='header';
   else if(name && code && Number(cell(v[3]))>0){kind='asset';}
   else if(name&&code){kind='asset';issue='จำนวนหรือราคาของรายการย่อยยังไม่ครบ ต้องระบุวิธีลงมูลค่าชุด';issueType='price';}
   else if(!name&&/\d{2,}[-/]/.test(code)){kind='asset';issue='ชื่อหรือข้อมูลรายการที่รวมเซลล์ยังไม่ครบ ต้องตรวจสอบต้นฉบับ';issueType='name';}
   else if(!name&&code){kind='group';group=text;}
   else if(/ชุด|โครงการ|สัญญา|งบประมาณ|ประกอบด้วย|ทดแทน/.test(text)){kind='group';group=text;}
   let qty=Number(cell(v[3])),unit=0,total=0;
   let explicitCat = '';
   let finalGroup = '';
   if (columns) {
     const vGroup = str(v[columns.group]);
     const vOffice = columns.category >= 0 ? str(v[columns.category]) : '';
     if (standardCategories.includes(vGroup as any)) {
       explicitCat = vGroup;
       finalGroup = vOffice;
     } else {
       explicitCat = vOffice;
       finalGroup = vGroup;
     }
   } else {
     finalGroup = [group, ...v.slice(8).map(str)].filter(Boolean).join(' • ');
   }
   const groupName = finalGroup;
   if(kind==='asset'){
    try{unit=satang(cell(v[4]));total=satang(cell(v[5]));}catch{issue ||= 'ข้อมูลราคาไม่ครบหรือไม่มีค่าผลลัพธ์สูตร';issueType='price';}
    if(!Number.isSafeInteger(qty)||qty<=0){qty=0;issue ||= 'ตรวจสอบจำนวนรายการ';}
    if(qty&&unit*qty!==total){issue ||= 'จำนวน × ราคาต่อหน่วยไม่ตรงยอดเดิม';if(issueType==='other')issueType='price';}
    if(codeHistorical.has(code)&&!historical){issue ||= 'รหัสนี้มีอยู่ในชีตชำรุด/ประวัติ อาจแทงจำหน่ายแล้ว';issueType='duplicate';}
    else if((codeCounts.get(code)||0)>1){issue ||= 'รหัสครุภัณฑ์ซ้ำซ้อนในไฟล์';issueType='duplicate';}
    else if(historical){issue ||= 'ชีตประวัติ / ชำรุด ต้องตรวจสอบรายการซ้ำกับทะเบียนหลัก';issueType='duplicate';}
    if(/ถึง/.test(code)||/\(\d+-\d+\)/.test(code)){issue ||= 'ช่วงรหัสไม่ชัดเจน ต้องตรวจสอบหมายเลขรายชิ้น';issueType='range';}
    if(group && (!unit || !total || unit*qty !== total)){issue ||= 'รายการอยู่ในชุด / โครงการ ต้องยืนยันการจัดกลุ่มและการลงมูลค่า';if(issueType==='other')issueType='price';}
    if(!unit&&!total&&!issue){issue='ยังไม่มีราคาต่อหน่วย/จำนวนเงิน';issueType='price';}
    if(!issue)issueType='ready';
   }
   const rawBranch = columns ? str(v[columns.branch]) : (str(v[7]) || str(v[8]));
   const branch = normalizeBranch(rawBranch, str(v[6]), sheet.name);
   const category = explicitCat || resolveCategory(branch, sheet.name);
   out.push({key:sheet.name+':'+r.row,sheet:sheet.name,row:r.row,kind,issue,issueType,groupName,values:v,asset:{code,name,quantity:qty||0,unitSatang:unit,totalSatang:total,notes:str(v[6]),location:columns&&columns.location>=0?str(v[columns.location]):str(v[6]),branch,groupName:groupName||'ทั่วไป',category,condition:'normal'}});
  }
 }return out;
}

// ผลต่างการตรวจนับ: เทียบจำนวนที่พบจริงกับจำนวนในทะเบียน ณ วันเปิดรอบ (ขาด / เกิน / ตรง / ยังไม่ได้ตรวจ)
export type StocktakeDifference = { kind: 'unchecked' | 'match' | 'short' | 'over'; amount: number };
export function stocktakeDifference(expected: number, found: number | null | undefined): StocktakeDifference {
  if (found === null || found === undefined) return { kind: 'unchecked', amount: 0 };
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(found) || expected < 0 || found < 0) throw Error('จำนวนตรวจนับต้องเป็นจำนวนเต็มไม่ติดลบ');
  if (found === expected) return { kind: 'match', amount: 0 };
  return found < expected ? { kind: 'short', amount: expected - found } : { kind: 'over', amount: found - expected };
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
