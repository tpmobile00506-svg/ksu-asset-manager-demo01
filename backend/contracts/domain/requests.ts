import { roles, ADMIN_APPROVES_ALL, type Role } from './constants.ts';
import { normalizeBranch } from './branches.ts';
import { thaiFiscalYear } from './dates.ts';

// คำขอ (โอนย้าย / ซ่อม / จำหน่าย): เลขที่คำขอตามปีงบ และสายอนุมัติ หัวหน้าสาขา → รองคณบดี → คณบดี
// เลขที่คำขอ REQ-<ปีงบ>-<ลำดับ 4 หลัก> รันใหม่ทุกปีงบประมาณ
export const formatRequestNo = (fiscalYear: number, seq: number) => `REQ-${fiscalYear}-${String(seq).padStart(4, '0')}`;
type NumberedRequest = { id: string; createdAt: string; payload: string };
const storedSeq = (payload: string) => {
  try {
    const seq = (JSON.parse(payload || '{}') as { seq?: unknown }).seq;
    return Number.isSafeInteger(seq) && (seq as number) > 0 ? (seq as number) : null;
  } catch {
    return null;
  }
};
// ลำดับถัดไปของปีงบ: คำขอใหม่เก็บลำดับไว้ใน payload.seq ตอนยื่น (ใน transaction แบบ Serializable)
// คำขอเก่าที่ไม่มี seq นับตามลำดับเวลายื่น จึงใช้ค่ามากสุดระหว่าง "จำนวนคำขอในปี" กับ "seq มากสุด" กันเลขซ้ำ
export function nextRequestSeq(sameYear: readonly Pick<NumberedRequest, 'payload'>[]): number {
  return Math.max(sameYear.length, ...sameYear.map(r => storedSeq(r.payload) ?? 0)) + 1;
}
// เลขที่คำขอของทุกรายการ (id → REQ-2570-0001): ใช้ seq ที่บันทึกไว้ ถ้าเป็นคำขอเก่าใช้ลำดับตามเวลายื่นในปีงบเดียวกัน
export function requestNumbers(requests: readonly NumberedRequest[]): Map<string, string> {
  const out = new Map<string, string>(),
    rank = new Map<number, number>();
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const ordered = [...requests].sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  for (const r of ordered) {
    const year = thaiFiscalYear(r.createdAt),
      n = (rank.get(year) ?? 0) + 1;
    rank.set(year, n);
    out.set(r.id, formatRequestNo(year, storedSeq(r.payload) ?? n));
  }
  return out;
}

// สายอนุมัติจากค่าตั้ง: ต้องมี 1–3 ขั้น ไม่ซ้ำ และเป็น head/deputy/dean เท่านั้น
// ค่าที่เสีย (เช่น "[]") ใช้ค่าเริ่มต้น ไม่งั้นคำขอใหม่จะไม่มีผู้อนุมัติและค้างตลอดไป
export const DEFAULT_APPROVAL_CHAIN = ['head', 'deputy', 'dean'] as const;
export function approvalChainOf(value?: string | null): { chain: string[]; valid: boolean } {
  try {
    const chain = JSON.parse(value || '');
    if (
      Array.isArray(chain) &&
      chain.length >= 1 &&
      chain.length <= 3 &&
      new Set(chain).size === chain.length &&
      chain.every(r => r === 'head' || r === 'deputy' || r === 'dean')
    )
      return { chain, valid: true };
  } catch {
    /* ค่าที่ไม่ใช่ JSON ใช้ค่าเริ่มต้น */
  }
  return { chain: [...DEFAULT_APPROVAL_CHAIN], valid: false };
}
// ป้าย "รออนุมัติ…" ของครุภัณฑ์ที่มีคำขอค้างอยู่ (ผู้ใช้เลือก 18 ต.ค. 2569) แสดงแทนสภาพระหว่างรออนุมัติเท่านั้น
// สภาพในฐานข้อมูลไม่เปลี่ยนจนกว่าจะอนุมัติครบ ถ้าไม่อนุมัติ ป้ายหายเองและกลับเป็นสภาพเดิม
export const awaitingLabels: Record<string, string> = {
  repair: 'รออนุมัติซ่อม',
  transfer: 'รออนุมัติโอนย้าย',
  disposal: 'รออนุมัติจำหน่าย',
};
export type AwaitingApproval = { label: string; detail: string };
export function awaitingApprovalByAsset(
  requests: readonly {
    assetId: string;
    kind: string;
    status: string;
    stage: number;
    chain: string;
    payload: string;
    requestNo?: string;
  }[],
  assets: readonly { id: string; setId?: string | null }[],
): Map<string, AwaitingApproval> {
  const out = new Map<string, AwaitingApproval>();
  for (const r of requests) {
    if (r.status !== 'pending') continue;
    let chain: string[] = [...DEFAULT_APPROVAL_CHAIN],
      payload: { setId?: unknown } = {};
    try {
      chain = JSON.parse(r.chain);
    } catch {
      /* ใช้สายอนุมัติเริ่มต้น */
    }
    try {
      payload = JSON.parse(r.payload || '{}');
    } catch {
      /* ไม่มีรายละเอียด */
    }
    const waiting = (roles[chain[r.stage] as Role] ?? chain[r.stage] ?? '').replace(/ \(.*\)$/, '');
    const info = {
      label: awaitingLabels[r.kind] ?? 'รออนุมัติ',
      detail: [r.requestNo, `รอ${waiting} (ขั้น ${r.stage + 1}/${chain.length})`].filter(Boolean).join(' · '),
    };
    // โอนย้าย/จำหน่ายของชุดมีผลทั้งชุดเมื่ออนุมัติ จึงติดป้ายทุกรายการในชุด
    const members =
      payload.setId && (r.kind === 'transfer' || r.kind === 'disposal')
        ? assets.filter(a => a.setId === payload.setId).map(a => a.id)
        : [];
    for (const id of [r.assetId, ...members]) if (!out.has(id)) out.set(id, info);
  }
  return out;
}
// คำขอนี้รอผู้ใช้คนนี้อนุมัติอยู่หรือไม่ (ใช้ทั้งหน้าคำขอและกระดิ่งแจ้งเตือน ให้นับตรงกัน)
// ขั้นของหัวหน้าสาขา: ต้องเป็นสาขาเดียวกับครุภัณฑ์ · ห้ามอนุมัติคำขอของตัวเอง
export function awaitsApprovalBy(
  r: { status: string; chain: string; stage: number; actor: string },
  me: { id: string; role: string; branch?: string | null },
  assetBranch?: string | null,
): boolean {
  if (r.status !== 'pending') return false;
  if (ADMIN_APPROVES_ALL && me.role === 'admin') return true;
  if (r.actor === me.id) return false;
  let chain: string[] = [...DEFAULT_APPROVAL_CHAIN];
  try {
    chain = JSON.parse(r.chain);
  } catch {
    /* ใช้สายอนุมัติเริ่มต้น */
  }
  const stageRole = chain[r.stage];
  if (stageRole !== me.role) return false;
  if (stageRole !== 'head') return true;
  return !!me.branch && !!assetBranch && normalizeBranch(me.branch) === normalizeBranch(assetBranch);
}

// คำขอที่ "รอผู้ใช้คนนี้": ผู้อนุมัติ = คำขอที่รอขั้นของตัวเอง · เจ้าหน้าที่และผู้ดูแลระบบ = คำขอที่รออนุมัติทั้งหมด
// เมนูข้าง กระดิ่ง และแท็บ "รอฉันอนุมัติ" ใช้ฟังก์ชันนี้ตัวเดียว เลขจึงตรงกันเสมอ (เดิมเมนูนับทุกคำขอ กระดิ่งนับเฉพาะของตัวเอง)
export function pendingForUser<
  R extends { status: string; chain: string; stage: number; actor: string; assetId: string },
>(
  requests: readonly R[],
  me: { id: string; role: string; branch?: string | null },
  assets: readonly { id: string; branch?: string | null }[],
): R[] {
  const approver = me.role === 'head' || me.role === 'deputy' || me.role === 'dean';
  if (!approver) return requests.filter(r => r.status === 'pending');
  // ตารางสาขาของครุภัณฑ์สร้างครั้งเดียว (เดิมไล่หาในทะเบียนทีละคำขอ 20,000 × คำขอที่รอ ทุกครั้งที่หน้าเปลี่ยน)
  const branchById = new Map(assets.map(a => [a.id, a.branch]));
  return requests.filter(r => r.status === 'pending' && awaitsApprovalBy(r, me, branchById.get(r.assetId)));
}
