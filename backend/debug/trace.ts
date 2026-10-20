// โหมดดูการทำงานหลังบ้านแบบสด สำหรับเดโมและเรียนรู้ระบบ: รัน `npm run dev:trace` แล้ว Terminal จะเล่าทีละขั้น
// ว่าหลังบ้านทำอะไรกับแต่ละคำขอ ตั้งแต่ตรวจตัวตน ตรวจสิทธิ์ ไปจนถึงคำสั่ง SQL ที่ Prisma ส่งเข้าฐานข้อมูล
// ปิดเป็นค่าเริ่มต้น (ไม่มี DEBUG_TRACE) เว็บจริงจึงไม่ได้รับผลกระทบ · ไม่พิมพ์ค่าพารามิเตอร์ของ SQL เพราะอาจมีแฮชรหัสผ่านหรือข้อมูลส่วนตัว
import { AsyncLocalStorage } from 'node:async_hooks';

type Context = { id: number; start: number; method: string; sqlCount: number; reads: Map<string, number> };
const store = new AsyncLocalStorage<Context>();
let sequence = 0;

/** DEBUG_TRACE=1 เล่าแบบอ่านง่าย · DEBUG_TRACE=2 แสดงคำสั่ง SQL เต็มด้วย */
export const traceOn = () => process.env.DEBUG_TRACE === '1' || process.env.DEBUG_TRACE === '2';
const fullSql = () => process.env.DEBUG_TRACE === '2';

const color = {
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};
function print(text: string, tone = '') {
  const ctx = store.getStore();
  console.log(`${color.dim}[หลังบ้าน${ctx ? ' #' + ctx.id : ''}]${color.reset} ${tone}${text}${color.reset}`);
}

export const trace = {
  /** ขั้นที่กำลังทำ */
  step(text: string) {
    if (traceOn()) print('• ' + text);
  },
  /** ขั้นที่ผ่านแล้ว */
  ok(text: string) {
    if (traceOn()) print('✓ ' + text, color.green);
  },
  /** เรื่องที่ควรสังเกต เช่น กดซ้ำ หรือชนกับคนอื่น */
  warn(text: string) {
    if (traceOn()) print('! ' + text, color.yellow);
  },
};

const ACTIONS: Record<string, string> = {
  create: 'เพิ่มครุภัณฑ์ใหม่',
  edit: 'แก้ไขข้อมูลครุภัณฑ์',
  split: 'แบ่งล็อต',
  bulkEdit: 'แก้ไขหลายรายการพร้อมกัน',
  request: 'ยื่นคำขอ (โอนย้าย / ซ่อม / จำหน่าย)',
  approve: 'อนุมัติคำขอ',
  reject: 'ไม่อนุมัติคำขอ',
  repairComplete: 'บันทึกซ่อมเสร็จ',
  void: 'ยกเลิกรายการที่บันทึกผิด',
  round: 'เปิดรอบตรวจนับ',
  check: 'บันทึกผลตรวจนับ',
  closeRound: 'ปิดรอบตรวจนับ',
  user: 'จัดการบัญชีผู้ใช้',
  workflow: 'ตั้งค่าสายอนุมัติ',
  import: 'นำเข้าครุภัณฑ์จาก Excel (ทีละแถว)',
  batchImport: 'นำเข้าครุภัณฑ์จาก Excel (หลายแถว)',
  rowOverride: 'กำหนดประเภทแถวในไฟล์นำเข้า',
  fundSave: 'บันทึกทุน',
  fundDelete: 'ลบทุน',
  fundAssign: 'ผูกครุภัณฑ์กับทุน',
  fundUnassign: 'ยกเลิกผูกทุน',
};
export const describeAction = (action: unknown) => ACTIONS[String(action)] ?? `คำสั่ง “${String(action)}”`;

const TABLES: Record<string, string> = {
  assets: 'ทะเบียนครุภัณฑ์',
  audit: 'ประวัติการทำงาน',
  operations: 'บันทึกกันกดซ้ำ',
  requests: 'คำขอ',
  approvals: 'ลายเซ็นอนุมัติ',
  users: 'ผู้ใช้',
  auth_sessions: 'เซสชันล็อกอิน',
  invites: 'คำเชิญ',
  login_attempts: 'ตัวนับล็อกอินผิด',
  settings: 'ค่าตั้งระบบ',
  stocktakes: 'รอบตรวจนับ',
  stocktake_items: 'รายการตรวจนับ',
  repair_records: 'ประวัติซ่อม',
  asset_sets: 'ชุดและทุน',
  locations: 'สถานที่',
  branches: 'สาขา',
  categories: 'ประเภท',
  asset_groups: 'หมวด',
  stored_files: 'ไฟล์และรูป',
  imports: 'ไฟล์นำเข้า',
  source_rows: 'แถวต้นฉบับ',
};
/** แปลคำสั่ง SQL หนึ่งคำสั่งเป็นภาษาคน: SELECT/INSERT/UPDATE/DELETE กับตารางไหน หรือคำสั่งคุม transaction */
export function describeSql(sql: string): { verb: string; table?: string; text: string } {
  const s = sql.trim(),
    verb = (s.split(/\s+/)[0] || '').toUpperCase();
  if (verb === 'BEGIN' || verb === 'START') return { verb: 'BEGIN', text: 'เริ่ม transaction' };
  if (verb === 'COMMIT') return { verb, text: 'ยืนยันการบันทึกทั้งหมด (COMMIT)' };
  if (verb === 'ROLLBACK') return { verb, text: 'ยกเลิกทั้งหมด (ROLLBACK) ข้อมูลกลับเป็นเหมือนเดิม' };
  const table = s.match(/(?:FROM|INTO|UPDATE)\s+(?:"public"\.)?"([a-z_]+)"/i)?.[1];
  const name = table ? `${table} (${TABLES[table] ?? 'ตารางอื่น'})` : 'ฐานข้อมูล';
  const act =
    { SELECT: 'อ่านจาก', INSERT: 'เพิ่มแถวใหม่ใน', UPDATE: 'แก้ไขแถวใน', DELETE: 'ลบแถวใน' }[verb] ?? `${verb} กับ`;
  return { verb, table, text: `${act}ตาราง ${name}` };
}

/** เรียกจาก Prisma ทุกครั้งที่ส่ง SQL: คำขอแบบ GET สรุปเป็นบรรทัดเดียวตอนจบ คำขออื่นแสดงทีละคำสั่ง */
export function traceSql(sql: string, durationMs: number) {
  if (!traceOn()) return;
  const ctx = store.getStore(),
    d = describeSql(sql);
  if (ctx) ctx.sqlCount++;
  if (ctx && ctx.method === 'GET' && !fullSql()) {
    if (d.table) ctx.reads.set(d.table, (ctx.reads.get(d.table) ?? 0) + 1);
    return;
  }
  const short = fullSql() ? sql.replace(/\s+/g, ' ') : `${d.verb}${d.table ? ' … ' + d.table : ''}`;
  print(
    `  SQL ▸ ${short} ${color.dim}(${Math.round(durationMs)} ms)${color.reset}${color.gray} → ${d.text}`,
    color.gray,
  );
}

/** ครอบคำขอหนึ่งครั้ง: พิมพ์หัวเรื่อง เก็บเวลา และสรุปผลตอนส่งกลับหน้าเว็บ */
export async function traced<T>(method: string, path: string, run: () => Promise<T>): Promise<T> {
  if (!traceOn()) return run();
  const ctx: Context = { id: ++sequence, start: Date.now(), method, sqlCount: 0, reads: new Map() };
  return store.run(ctx, async () => {
    const what = method === 'GET' ? 'หน้าเว็บขอข้อมูล' : 'หน้าเว็บส่งคำสั่ง';
    console.log('');
    print(`━━━ คำขอ #${ctx.id} · ${method} ${path} · ${what} ━━━`, color.cyan + color.bold);
    const done = (ok: boolean, detail: string) => {
      if (ctx.reads.size)
        print(
          `  SQL ▸ อ่านข้อมูล ${ctx.sqlCount} คำสั่ง จาก ${ctx.reads.size} ตาราง: ${[...ctx.reads.keys()].join(', ')}`,
          color.gray,
        );
      print(
        `${ok ? '✓' : '✗'} ${detail} · ใช้เวลา ${Date.now() - ctx.start} ms · SQL ${ctx.sqlCount} คำสั่ง`,
        ok ? color.green + color.bold : color.red + color.bold,
      );
    };
    try {
      const result = await run();
      if (result instanceof Response && result.status >= 400) {
        const body = (await result
          .clone()
          .json()
          .catch(() => null)) as { error?: string } | null;
        done(false, `ส่งข้อผิดพลาดกลับหน้าเว็บ (${result.status})${body?.error ? ': ' + body.error : ''}`);
      } else done(true, `ส่งผลกลับหน้าเว็บ${result instanceof Response ? ` (${result.status})` : ''}`);
      return result;
    } catch (error) {
      const e = error as { message?: string; status?: number };
      done(false, `ไม่สำเร็จ${e.status ? ` (${e.status})` : ''}: ${e.message ?? String(error)}`);
      throw error;
    }
  });
}
