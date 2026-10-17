'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Asset, academicBranches, officeBranches, assetTypes, assetGroupOfType, conditions } from '@/shared/domain';

type Field = 'branch' | 'category' | 'location' | 'condition';

// แก้ไขหลายรายการพร้อมกัน: ติ๊กเฉพาะช่องที่จะเปลี่ยน ช่องที่ไม่ติ๊กคงค่าเดิม (ผู้ใช้ขอ 17 ต.ค. 2569)
export default function BulkEditModal({ assets, busy, error, onSubmit, onClose }: {
  assets: Asset[];
  busy: boolean;
  error: string;
  onSubmit: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [on, setOn] = useState<Record<Field, boolean>>({ branch: false, category: false, location: false, condition: false });
  const [values, setValues] = useState<Record<Field, string>>({ branch: '', category: '', location: '', condition: 'normal' });
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const toggle = (f: Field) => { setOn(prev => ({ ...prev, [f]: !prev[f] })); setProblem(''); };
  const set = (f: Field, v: string) => { setValues(prev => ({ ...prev, [f]: v })); setProblem(''); };

  function submit() {
    const changes: Record<string, string> = {};
    for (const f of Object.keys(on) as Field[]) if (on[f]) changes[f] = values[f].trim();
    if (!Object.keys(changes).length) return setProblem('ติ๊กช่องที่จะแก้อย่างน้อย 1 ช่อง');
    if (Object.values(changes).some(v => !v)) return setProblem('กรอกค่าใหม่ของช่องที่ติ๊กให้ครบ');
    if (!reason.trim()) return setProblem('กรุณาระบุเหตุผลการแก้ไข');
    onSubmit({
      action: 'bulkEdit', ids: assets.map(a => a.id), reason: reason.trim(), changes,
      versions: Object.fromEntries(assets.map(a => [a.id, a.version])),
    });
  }

  const row = (f: Field, label: string, control: React.ReactNode) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
        <input type="checkbox" checked={on[f]} onChange={() => toggle(f)} disabled={busy} />
        {label}
      </label>
      {on[f] && <div className="pl-6">{control}</div>}
    </div>
  );
  const selectClass = 'h-10 w-full rounded-md border border-input bg-white px-3 text-sm';

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>แก้ไข {assets.length} รายการพร้อมกัน</DialogTitle>
          <DialogDescription>ติ๊กเฉพาะช่องที่จะเปลี่ยน ช่องที่ไม่ติ๊กจะคงค่าเดิม</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {row('branch', 'สาขาวิชา / หน่วยงาน',
            <select className={selectClass} value={values.branch} onChange={e => set('branch', e.target.value)} disabled={busy}>
              <option value="" disabled>เลือกสาขาวิชา / หน่วยงาน</option>
              <optgroup label="สาขาวิชา">{academicBranches.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
              <optgroup label="หน่วยงาน">{officeBranches.map(b => <option key={b} value={b}>{b}</option>)}</optgroup>
            </select>)}
          {row('category', 'ประเภทครุภัณฑ์ (หมวดเปลี่ยนตาม)',
            <select className={selectClass} value={values.category} onChange={e => set('category', e.target.value)} disabled={busy}>
              <option value="" disabled>เลือกประเภทครุภัณฑ์</option>
              {assetTypes.map(t => <option key={t} value={t}>{t} ({assetGroupOfType(t)})</option>)}
            </select>)}
          {row('location', 'สถานที่',
            <Input value={values.location} onChange={e => set('location', e.target.value)} placeholder="อ.14 ชั้น 3 ห้อง 1431" autoComplete="off" disabled={busy} />)}
          {row('condition', 'สภาพ',
            <select className={selectClass} value={values.condition} onChange={e => set('condition', e.target.value)} disabled={busy}>
              <option value="normal">{conditions.normal}</option>
              <option value="damaged">{conditions.damaged}</option>
            </select>)}
          <label className="block space-y-1.5 text-sm font-medium text-slate-800">
            <span>เหตุผลการแก้ไข *</span>
            <Input value={reason} onChange={e => { setReason(e.target.value); setProblem(''); }} placeholder="นำเข้าผิดสาขา ของจริงเป็นของสาขาไฟฟ้า" autoComplete="off" disabled={busy} />
          </label>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">ใช้แก้ข้อมูลที่กรอกผิดเท่านั้น ถ้าย้ายของจริงให้ยื่นโอนย้ายผ่านสายอนุมัติ</p>
          {(problem || error) && <p role="alert" className="text-sm text-red-600">{problem || error}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={submit} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : `บันทึก ${assets.length} รายการ`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
