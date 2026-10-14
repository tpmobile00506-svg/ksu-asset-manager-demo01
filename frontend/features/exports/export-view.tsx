'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { assetTypes, branchAbbr, fiscalYearOf, money, standardBranches } from '@/shared/domain';
import { exportReport, pageLayouts, reportFileName, reportSelection, type PageLayout, type ReportKind } from '@/frontend/services/excel-export';
import type { WorkspaceData } from '@/shared/models';
import FundEditor from './fund-editor';

const kinds: Array<[ReportKind, string, string]> = [
  ['remaining', 'ครุภัณฑ์คงเหลือ', 'แยกแผ่นตามประเภท มียอดยกไป/ยอดยกมา'],
  ['damaged', 'พัสดุชำรุด (แนบท้าย)', 'แบ่งหัวข้อตามสาขา เลขหน้าต่อจากรายงานคงเหลือ'],
  ['both', 'ทั้งสองแบบในไฟล์เดียว', 'รายงานคงเหลือ + แผ่นพัสดุชำรุดต่อท้าย'],
];

type Write = (body: Record<string, unknown>) => Promise<any>;
export default function ExportView({ data, initialBranch = '', onDone, write, busy: writing = false }: { data: Pick<WorkspaceData, 'assets' | 'funds' | 'me'>; initialBranch?: string; onDone?: () => void; write?: Write; busy?: boolean }) {
  const currentYear = fiscalYearOf(new Date());
  const [kind, setKind] = useState<ReportKind>('remaining');
  const [branch, setBranch] = useState((standardBranches as readonly string[]).includes(initialBranch) ? initialBranch : '');
  const [type, setType] = useState('');
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [layout, setLayout] = useState<PageLayout>('portrait');
  const [excludeDamaged, setExcludeDamaged] = useState(true);
  const [busy, setBusy] = useState(false);

  const request = { kind, branch: branch || undefined, type: type || undefined, fiscalYear, layout, excludeDamaged };
  const sel = useMemo(() => reportSelection(data.assets, request), [data.assets, kind, branch, type, fiscalYear, layout, excludeDamaged]);
  const showMain = kind !== 'damaged', showDamaged = kind !== 'remaining';
  const empty = (showMain && !sel.remaining.length && !showDamaged) || (kind === 'damaged' && !sel.damaged.length) || (kind === 'both' && !sel.remaining.length && !sel.damaged.length);

  async function run() {
    setBusy(true);
    try {
      await exportReport(data.assets, request);
      toast.success('ส่งออก ' + reportFileName(request) + ' เรียบร้อยแล้ว');
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'ส่งออกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  const field = 'flex flex-col gap-1.5 text-sm';
  const select = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900';
  return (
    <div className="space-y-4">
      <div className="space-y-5">

        <fieldset className={field}>
          <legend className="font-bold text-slate-700 mb-1.5">1. รายงาน</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {kinds.map(([value, label, hint]) => (
              <label key={value} className={`cursor-pointer rounded-lg border p-3 ${kind === value ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" name="report-kind" className="mr-2" checked={kind === value} onChange={() => setKind(value)} />
                <span className="font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500 mt-1">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={field}>
            <span className="font-bold text-slate-700">2. สาขา</span>
            <select aria-label="สาขา" className={select} value={branch} onChange={e => setBranch(e.target.value)}>
              <option value="">ทุกสาขา (ทั้งคณะ)</option>
              {standardBranches.map(b => <option key={b} value={b}>{branchAbbr(b)} · {b}</option>)}
            </select>
          </label>
          <label className={field}>
            <span className="font-bold text-slate-700">3. ประเภทครุภัณฑ์</span>
            <select aria-label="ประเภทครุภัณฑ์" className={select} value={type} onChange={e => setType(e.target.value)} disabled={kind === 'damaged'}>
              <option value="">ทุกประเภท</option>
              {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={field}>
            <span className="font-bold text-slate-700">4. ปีงบประมาณ</span>
            <select aria-label="ปีงบประมาณ" className={select} value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map(n => <option key={n} value={currentYear - n}>{currentYear - n}{n === 0 ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </label>
          <label className={field}>
            <span className="font-bold text-slate-700">5. แบบหน้ากระดาษ</span>
            <select aria-label="แบบหน้ากระดาษ" className={select} value={layout} onChange={e => setLayout(e.target.value as PageLayout)} disabled={kind === 'damaged'}>
              {(Object.keys(pageLayouts) as PageLayout[]).map(k => <option key={k} value={k}>{pageLayouts[k].label}</option>)}
            </select>
          </label>
        </div>

        {showMain && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={excludeDamaged} onChange={e => setExcludeDamaged(e.target.checked)} />
            <span>ไม่รวมครุภัณฑ์สภาพ "ชำรุด" ในรายงานคงเหลือ (แยกไปอยู่รายงานพัสดุชำรุดแนบท้ายแทน)</span>
          </label>
        )}
      </div>

      {showMain && write && (
        <div className="border-t border-slate-200 pt-4">
          <FundEditor assets={data.assets} selection={sel.remaining} funds={data.funds || []} editable={['staff', 'admin'].includes(data.me.role)}
            write={write} busy={writing} branch={branch || undefined} type={type || undefined} />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2 text-sm text-slate-700">
        <div className="font-bold text-slate-900">สรุปก่อนส่งออก</div>
        {(showMain || kind === 'damaged') && (
          <div>
            รายงานครุภัณฑ์คงเหลือ: <b>{sel.remaining.length.toLocaleString('th-TH')}</b> รายการ · {sel.types} ประเภท ({sel.types} แผ่น) · {sel.mainPages} หน้า · ยอดรวม <b>{money(sel.remainingSatang)}</b> บาท
            {kind === 'damaged' && <span className="text-slate-500"> (ใช้นับเลขหน้าแนบท้ายเท่านั้น)</span>}
          </div>
        )}
        {showDamaged && (
          <div>
            รายงานพัสดุชำรุด: <b>{sel.damaged.length.toLocaleString('th-TH')}</b> รายการ · ยอดรวม <b>{money(sel.damagedSatang)}</b> บาท · เริ่ม "แนบท้ายหน้า {sel.mainPages + 1}"
          </div>
        )}
        <div className="text-xs text-slate-500">ชื่อไฟล์: {reportFileName(request)}</div>
      </div>

      <div className="flex justify-end">
        <Button disabled={busy || empty} onClick={run} className="h-10 px-4 font-bold bg-[#2563eb] hover:bg-[#1d4ed8] text-white cursor-pointer">
          <Download size={16} className="mr-1" /> {busy ? 'กำลังสร้างไฟล์…' : 'ส่งออก Excel'}
        </Button>
      </div>
      {empty && <p className="text-right text-xs text-slate-500">ไม่มีรายการตามที่เลือก</p>}
    </div>
  );
}
