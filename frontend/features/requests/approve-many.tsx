'use client';
import { requestTypes, roles } from '@/shared/domain';
import type { RequestRecord } from '@/shared/models';
import { baht } from '@/frontend/components/common';

// หน้าต่างยืนยัน "อนุมัติที่เลือก" (ผู้ใช้ขอ 8 พ.ย. 2569): ผู้อนุมัติต้องเห็นทุกใบก่อนกด
// ว่าแต่ละใบทำอะไร และใบไหนเป็นขั้นสุดท้ายที่ทะเบียนจะเปลี่ยนทันที

const readJson = <T,>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

// คำขอเก่าบางรายการเก็บประเภทจำหน่ายเป็น 'dispose'
const kindLabel = (kind: string) =>
  requestTypes[(kind === 'dispose' ? 'disposal' : kind) as keyof typeof requestTypes] ?? kind;

export const isFinalStage = (r: RequestRecord) => r.stage === readJson<string[]>(r.chain, []).length - 1;

function effect(r: RequestRecord): string {
  const p = readJson<{
    location?: string;
    branch?: string;
    estimateSatang?: number;
    splitQuantity?: number;
    setId?: string;
    setCount?: number;
  }>(r.payload || '{}', {});
  const parts: string[] = [];
  if (r.kind === 'transfer') parts.push(`ไป ${p.location || '—'}${p.branch ? ` (${p.branch})` : ''}`);
  if (r.kind === 'repair' && Number(p.estimateSatang) > 0)
    parts.push(`ค่าซ่อมประมาณ ${baht(Number(p.estimateSatang))}`);
  if (p.splitQuantity) parts.push(`เฉพาะ ${p.splitQuantity} ชิ้น`);
  else if (p.setId) parts.push(`ทั้งชุด ${p.setCount ?? ''} รายการ`);
  return parts.join(' · ');
}

export function ApproveManySummary({ list, role }: { list: RequestRecord[]; role: string }) {
  const finals = list.filter(isFinalStage).length;
  return (
    <>
      <div className="notice">
        อนุมัติ <b>{list.length.toLocaleString('th-TH')}</b> คำขอ ในขั้น{roles[role as keyof typeof roles] ?? role}
        <p className="mt-1">ระบบบันทึกลายเซ็นของคุณแยกทีละใบ เหมือนกดอนุมัติทีละใบ</p>
        {finals > 0 && (
          <p className="mt-1">
            <b>{finals.toLocaleString('th-TH')} ใบเป็นขั้นสุดท้าย</b> อนุมัติแล้วทะเบียนจะเปลี่ยนตามคำขอทันที
          </p>
        )}
      </div>
      <div className="request-many-list" aria-label="คำขอที่จะอนุมัติ">
        <ul>
          {list.map(r => (
            <li key={r.id} className="flex-wrap">
              <span className="font-mono">{r.requestNo}</span>
              <span className="font-semibold">{kindLabel(r.kind)}</span>
              <span className="font-mono">{r.code}</span>
              <span className="truncate">{r.name}</span>
              {effect(r) && <span className="w-full text-xs text-slate-600">{effect(r)}</span>}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-600">
        ใบไหนไม่ควรอนุมัติ ให้ปิดหน้าต่างนี้ เอาเครื่องหมายออก แล้วกด “ไม่อนุมัติ” ที่ใบนั้นพร้อมเหตุผล
      </p>
    </>
  );
}
