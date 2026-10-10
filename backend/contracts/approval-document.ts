import { money, roles, requestTypes, type Role } from './domain';

// เอกสารอนุมัติ (โอนย้าย / ซ่อมบำรุง / จำหน่าย) สำหรับพิมพ์ — ฟังก์ชันล้วน ไม่แตะ DOM จึงทดสอบได้ใน Node

export type ApprovalDocumentInput = {
  requestCode: string;
  kind: string;
  status: string;
  reason: string;
  createdAt: string;
  requesterName?: string;
  payload: Record<string, unknown>;
  chain: string[];
  asset: { code: string; name: string; quantity: number; totalSatang: number; location: string; branch: string; custodian: string } | null;
  approvals: Array<{ stage: number; actorName: string; decision: string; note: string; createdAt: string }>;
};

const esc = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const thaiDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

const kindLabel = (kind: string) => requestTypes[(kind === 'dispose' ? 'disposal' : kind) as keyof typeof requestTypes] ?? kind;
const roleLabel = (role: string) => roles[role as Role] ?? role;

export function buildApprovalDocumentHtml(input: ApprovalDocumentInput): string {
  const kind = kindLabel(input.kind);
  const a = input.asset;
  const detailRows: string[] = [];
  if (input.kind === 'transfer') {
    detailRows.push(`<tr><th>สถานที่/สาขาปลายทาง</th><td>${esc(input.payload.location)} (${esc(input.payload.branch)})</td></tr>`);
    if (input.payload.custodian) detailRows.push(`<tr><th>ผู้รับผิดชอบใหม่</th><td>${esc(input.payload.custodian)}</td></tr>`);
  }
  if (Number(input.payload.splitQuantity) > 0) {
    detailRows.push(`<tr><th>จำนวนที่ขอดำเนินการ</th><td>${esc(input.payload.splitQuantity)} ชิ้น (แบ่งล็อตเมื่ออนุมัติขั้นสุดท้าย)</td></tr>`);
  }
  if (input.kind === 'repair' && Number(input.payload.estimateSatang) > 0) {
    detailRows.push(`<tr><th>ประมาณการค่าซ่อม</th><td>${money(Number(input.payload.estimateSatang))} บาท</td></tr>`);
  }

  const stages = input.chain.map((role, stage) => {
    const done = input.approvals.find(x => x.stage === stage);
    const result = !done ? 'รอดำเนินการ' : done.decision === 'approve' ? 'อนุมัติ' : 'ส่งกลับแก้ไข';
    return `<tr>
      <td>${stage + 1}. ${esc(roleLabel(role))}</td>
      <td>${esc(done?.actorName || '')}</td>
      <td>${result}</td>
      <td>${esc(done?.note || '')}</td>
      <td>${done ? thaiDate(done.createdAt) : ''}</td>
    </tr>`;
  }).join('');

  const signatures = input.chain.map(role => `<div class="sign">
      <div class="line">ลงชื่อ ..........................................</div>
      <div>(${'.'.repeat(34)})</div>
      <div>${esc(roleLabel(role))}</div>
      <div>วันที่ ......../......../........</div>
    </div>`).join('');

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>เอกสารอนุมัติ ${esc(input.requestCode)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'TH SarabunPSK', 'TH Sarabun New', 'Leelawadee UI', Tahoma, sans-serif; font-size: 15pt; color: #000; }
  h1 { font-size: 18pt; text-align: center; margin: 0; }
  h2 { font-size: 15pt; text-align: center; margin: 4px 0 14px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #333; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; width: 32%; }
  table.stages th { width: auto; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .signs { display: flex; gap: 12px; margin-top: 28px; }
  .sign { flex: 1; text-align: center; font-size: 13pt; }
  .sign .line { margin-bottom: 4px; }
</style></head><body>
  <h1>มหาวิทยาลัยกาฬสินธุ์ · คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</h1>
  <h2>เอกสารอนุมัติ${esc(kind)}ครุภัณฑ์</h2>
  <div class="meta"><span>เลขที่คำขอ: ${esc(input.requestCode)}</span><span>วันที่ยื่นคำขอ: ${thaiDate(input.createdAt)}</span></div>
  <table>
    <tr><th>หมายเลขครุภัณฑ์</th><td>${esc(a?.code)}</td></tr>
    <tr><th>รายการ</th><td>${esc(a?.name)}</td></tr>
    <tr><th>จำนวน / มูลค่ารวม</th><td>${a ? `${a.quantity} ชิ้น · ${money(a.totalSatang)} บาท` : '—'}</td></tr>
    <tr><th>สังกัด / สถานที่ตั้ง</th><td>${esc(a?.branch)} · ${esc(a?.location)}</td></tr>
    <tr><th>ผู้รับผิดชอบ</th><td>${esc(a?.custodian) || '—'}</td></tr>
    <tr><th>ประเภทคำขอ</th><td>${esc(kind)}</td></tr>
    <tr><th>เหตุผล</th><td>${esc(input.reason)}</td></tr>
    ${detailRows.join('\n    ')}
    ${input.requesterName ? `<tr><th>ผู้ยื่นคำขอ</th><td>${esc(input.requesterName)}</td></tr>` : ''}
  </table>
  <table class="stages">
    <tr><th>ขั้นการอนุมัติ</th><th>ผู้ลงนามในระบบ</th><th>ผล</th><th>หมายเหตุ</th><th>วันที่</th></tr>
    ${stages}
  </table>
  <div class="signs">${signatures}</div>
</body></html>`;
}
