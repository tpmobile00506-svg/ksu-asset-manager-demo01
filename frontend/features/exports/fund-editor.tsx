'use client';

import { useMemo, useRef, useState } from 'react';
import { Coins, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { assetTypes, branchAbbr, money, normalizeBranch, standardBranches, type Asset } from '@/shared/domain';
import type { FundRecord } from '@/shared/models';

type Write = (body: Record<string, unknown>) => Promise<any>;
type Props = { assets: Asset[]; selection: Asset[]; funds: FundRecord[]; editable: boolean; write: Write; busy: boolean; branch?: string; type?: string };

const PREVIEW_ROWS = 5;
const sumOf = (list: Asset[]) => list.reduce((n, a) => n + (a.setRole === 'part' ? 0 : a.totalSatang), 0);

// ขั้น "จัดหัวทุน" ในหน้าต่างส่งออก: ทุนมีเฉพาะครุภัณฑ์ที่เจ้าหน้าที่เลือกใส่ รายการแนะนำจากไฟล์ต้นฉบับต้องติ๊กยืนยันเอง
export default function FundEditor({ assets, selection, funds, editable, write, busy, branch, type }: Props) {
  const [created, setCreated] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<FundRecord | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [deleting, setDeleting] = useState<{ fund: FundRecord; count: number } | null>(null);

  // ทุนที่แสดง: มีครุภัณฑ์อยู่ในรายงานนี้ หรือมีรายการแนะนำในรายงานนี้ หรือยังไม่มีครุภัณฑ์เลย (จะได้ใส่ต่อได้)
  // เรียง: ทุนที่เพิ่งสร้าง → ทุนว่าง → ตามตำแหน่งรายการแรกในรายงาน
  const rows = useMemo(() => {
    const inSel = new Set(selection.map(a => a.id));
    const first = new Map<string, number>();
    selection.forEach((a, i) => {
      if (a.fundId && !first.has(a.fundId)) first.set(a.fundId, i);
      if (a.fundHintId && !first.has(a.fundHintId)) first.set(a.fundHintId, i + selection.length);
    });
    // ทุนที่มีรายการแนะนำจากไฟล์ต้นฉบับ (ที่ไหนก็ได้) ไม่ใช่ "ทุนว่างที่เพิ่งสร้าง" จึงแสดงเฉพาะเมื่อเกี่ยวกับรายงานนี้
    const hinted = new Set(assets.map(a => a.fundHintId).filter(Boolean));
    return funds.map(f => {
      const members = assets.filter(a => a.fundId === f.id && a.lifecycle === 'active');
      const hints = assets.filter(a => a.fundHintId === f.id && !a.fundId && a.lifecycle === 'active' && inSel.has(a.id));
      const isNew = created.indexOf(f.id);
      const emptyOwn = !members.length && !hinted.has(f.id);
      const order = isNew >= 0 ? -1000 - isNew : emptyOwn ? -1 : first.get(f.id) ?? Infinity;
      return { fund: f, members, inReport: members.filter(a => inSel.has(a.id)), hints, order, show: isNew >= 0 || emptyOwn };
    }).filter(r => r.inReport.length || r.hints.length || r.show).sort((a, b) => a.order - b.order);
  }, [assets, selection, funds, created]);
  const confirmed = rows.filter(r => r.members.length || !r.hints.length || created.includes(r.fund.id));
  const hintOnly = rows.filter(r => !confirmed.includes(r));

  async function createFund() {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    // ชื่อซ้ำกับทุนที่มีอยู่: เปิดทุนเดิมเลย ไม่ต้องส่งไปบันทึก (ไม่งั้นขึ้นแจ้งเตือนซ้อน 2 อัน)
    const same = funds.find(f => f.name.trim().replace(/\s+/g, ' ') === name);   // ชื่อจากไฟล์ต้นฉบับมีช่องว่างซ้อน
    if (same) {
      toast.info('มีทุนชื่อนี้อยู่แล้ว เปิดทุนเดิมให้ใส่ครุภัณฑ์ต่อ');
      setNewName('');
      setCreated(prev => prev.includes(same.id) ? prev : [same.id, ...prev]);
      setPicking(same);
      return;
    }
    const r = await write({ action: 'fundSave', name });
    if (!r?.id) return;
    setNewName('');
    setCreated(prev => [String(r.id), ...prev]);
    setPicking(funds.find(f => f.id === r.id) ?? { id: String(r.id), name });
  }
  async function rename() {
    if (!renaming?.name.trim()) return;
    if (await write({ action: 'fundSave', fundId: renaming.id, name: renaming.name })) setRenaming(null);
  }
  async function remove() {
    if (!deleting) return;
    const fundId = deleting.fund.id;
    setDeleting(null);
    await write({ action: 'fundDelete', fundId });
    setCreated(prev => prev.filter(x => x !== fundId));
  }

  const fundCard = ({ fund, members, inReport, hints }: (typeof rows)[number]) => {
    const open = expanded.has(fund.id);
    const shown = open ? members : members.slice(0, PREVIEW_ROWS);
    return (
      <div key={fund.id} className="rounded-lg border border-amber-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-3 py-2">
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">หัวทุน</span>
          {renaming?.id === fund.id ? (
            <>
              <input aria-label="ชื่อทุน" className="h-8 min-w-0 flex-1 rounded border border-amber-400 bg-white px-2 text-sm" value={renaming.name}
                onChange={e => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && rename()} autoFocus />
              <Button size="sm" disabled={busy} onClick={rename}>บันทึก</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}><X size={14} /></Button>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{fund.name}</span>
          )}
          <span className="text-xs text-amber-800 whitespace-nowrap">
            {members.length ? `${members.length.toLocaleString('th-TH')} รายการ · ${money(sumOf(members))} บาท` : 'ยังไม่มีรายการ'}
            {members.length !== inReport.length && ` (อยู่ในรายงานนี้ ${inReport.length})`}
          </span>
          {editable && renaming?.id !== fund.id && (
            <>
              <Button size="sm" variant="outline" className="h-7 bg-white" onClick={() => setRenaming({ id: fund.id, name: fund.name })}><Pencil size={13} />แก้ชื่อ</Button>
              <Button size="sm" variant="outline" className="h-7 bg-white text-red-700" onClick={() => setDeleting({ fund, count: members.length })}><Trash2 size={13} />ลบ</Button>
              <Button size="sm" variant="outline" className="h-7 border-blue-500 bg-white font-bold text-blue-700" onClick={() => setPicking(fund)}><Plus size={13} />เพิ่มครุภัณฑ์เข้าทุนนี้</Button>
            </>
          )}
        </div>
        {shown.map(a => (
          <div key={a.id} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem_7rem_auto] items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-sm">
            <span className="truncate font-mono text-xs text-blue-700">{a.code}</span>
            <span className="truncate">{a.name}</span>
            <span className="text-xs text-slate-500">{branchAbbr(a.branch)}</span>
            <span className="text-right">{a.setRole === 'part' ? 'รวมในชุด' : money(a.totalSatang)}</span>
            {editable ? <Button size="sm" variant="ghost" className="h-7 text-red-700" disabled={busy} onClick={() => write({ action: 'fundUnassign', assetIds: [a.id] })}>เอาออก</Button> : <span />}
          </div>
        ))}
        {members.length > PREVIEW_ROWS && (
          <button type="button" className="w-full border-t border-slate-100 py-1.5 text-xs text-blue-700 hover:bg-slate-50"
            onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(fund.id)) n.delete(fund.id); else n.add(fund.id); return n; })}>
            {open ? 'ย่อรายการ' : `ดูทั้งหมด ${members.length.toLocaleString('th-TH')} รายการ`}
          </button>
        )}
        {editable && hints.length > 0 && (
          <div className="border-t border-amber-100 bg-amber-50/40 px-3 py-1.5 text-xs text-amber-800">
            <Star size={12} className="mr-1 inline" />มีรายการแนะนำจากไฟล์ต้นฉบับอีก {hints.length} รายการ — กด "เพิ่มครุภัณฑ์เข้าทุนนี้" เพื่อตรวจและติ๊กยืนยัน
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="font-bold text-slate-700">6. จัดหัวทุน</span>
        <span className="ml-2 text-xs text-slate-500">หัวทุนขึ้นเหนือเฉพาะครุภัณฑ์ที่ใส่เข้าทุนแล้ว รายการอื่นไม่มีหัวทุน</span>
      </div>
      {confirmed.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีทุนในรายงานนี้</p>}
      {confirmed.map(fundCard)}
      {hintOnly.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300">
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-50" onClick={() => setShowHints(v => !v)}>
            <Star size={14} /> หัวทุนจากไฟล์ต้นฉบับที่ยังไม่ได้ยืนยัน {hintOnly.length} หัว (มีรายการแนะนำในรายงานนี้)
            <span className="ml-auto text-xs text-blue-700">{showHints ? 'ซ่อน' : 'แสดง'}</span>
          </button>
          {showHints && <div className="space-y-2 p-2 pt-0">{hintOnly.map(fundCard)}</div>}
        </div>
      )}
      {editable && (
        <div className="flex gap-2">
          <input aria-label="ชื่อทุนใหม่" className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-slate-300 px-3 text-sm" placeholder="ชื่อทุน / โครงการ เช่น ครุภัณฑ์ห้องปฏิบัติการออกแบบและเขียนแบบด้วยคอมพิวเตอร์ พร้อมอุปกรณ์"
            value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFund()} />
          <Button variant="outline" disabled={busy || !newName.trim()} onClick={createFund}><Plus size={15} />สร้างทุนใหม่</Button>
        </div>
      )}
      <AlertDialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
        <AlertDialogContent className="bg-white max-w-md p-6 rounded-xl border border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">ลบหัวทุนนี้?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 mt-2">"{deleting?.fund.name}"</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-900 my-2">
            {deleting?.count
              ? `ครุภัณฑ์ ${deleting.count.toLocaleString('th-TH')} รายการในทุนนี้จะไม่มีหัวทุน แต่ตัวครุภัณฑ์ยังอยู่ครบ ไม่ถูกลบ`
              : 'ทุนนี้ยังไม่มีครุภัณฑ์ ลบได้โดยไม่กระทบรายการใด'}
          </div>
          <AlertDialogFooter className="mt-4 flex gap-2 justify-end">
            <AlertDialogCancel className="rounded-lg border-slate-200">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4" onClick={remove}>ลบหัวทุน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {picking && <FundPicker fund={picking} assets={assets} branch={branch} type={type} busy={busy} write={write} onClose={() => setPicking(null)} />}
    </div>
  );
}

function FundPicker({ fund, assets, branch, type, busy, write, onClose }: { fund: FundRecord; assets: Asset[]; branch?: string; type?: string; busy: boolean; write: Write; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [fBranch, setFBranch] = useState(branch || '');
  const [fType, setFType] = useState(type || '');
  const [hideAssigned, setHideAssigned] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  // จำรายการที่คลิกล่าสุดเป็น id (ไม่ใช่ลำดับแถว) เพราะลำดับเปลี่ยนเมื่อค้นหา/กรองใหม่
  const lastClick = useRef<string | null>(null);

  const usable = assets.filter(a => a.lifecycle === 'active' && a.fundId !== fund.id);
  const hints = usable.filter(a => a.fundHintId === fund.id);
  const q = query.trim().toLowerCase();
  const results = q ? usable.filter(a => a.fundHintId !== fund.id
    && (!fBranch || normalizeBranch(a.branch || '', '', '') === fBranch) && (!fType || a.category === fType)
    && (!hideAssigned || !a.fundId)
    && [a.code, a.name, a.serial, a.location].join(' ').toLowerCase().includes(q)) : [];
  const LIMIT = 300;
  const list = [...hints, ...results.slice(0, LIMIT)];
  const canPick = (a: Asset) => !a.fundId;
  const chosen = assets.filter(a => picked.has(a.id));

  function toggle(index: number, shift: boolean) {
    const a = list[index];
    if (!canPick(a)) return;
    const next = new Set(picked);
    const on = !next.has(a.id);
    const anchor = shift && lastClick.current !== null ? list.findIndex(x => x.id === lastClick.current) : -1;
    if (anchor >= 0) {
      // Shift + คลิก: เลือกทั้งช่วงจากรายการที่คลิกก่อนหน้า (ถ้ารายการนั้นยังอยู่ในผลค้นหาปัจจุบัน)
      const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
      for (const x of list.slice(from, to + 1)) if (canPick(x)) { if (on) next.add(x.id); else next.delete(x.id); }
    } else if (on) next.add(a.id); else next.delete(a.id);
    lastClick.current = a.id;
    setPicked(next);
  }
  const setMany = (items: Asset[], on: boolean) => setPicked(prev => {
    const n = new Set(prev);
    for (const a of items) if (canPick(a)) { if (on) n.add(a.id); else n.delete(a.id); }
    return n;
  });
  async function save() {
    if (!picked.size) { setError('ติ๊กเลือกครุภัณฑ์อย่างน้อย 1 รายการ'); return; }
    if (await write({ action: 'fundAssign', fundId: fund.id, assetIds: [...picked] })) onClose();
  }

  const row = (a: Asset, index: number, hint: boolean) => {
    const disabled = !canPick(a);
    return (
      // แถวเป็น div (ไม่ใช่ label) เพื่อไม่ให้เบราว์เซอร์สลับช่องติ๊กเองซ้อนกับ state จนช่องที่เห็นไม่ตรงกับที่เลือกจริง
      <div key={a.id} role="checkbox" aria-checked={picked.has(a.id)} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} className={`grid cursor-pointer select-none grid-cols-[1.5rem_minmax(0,14rem)_minmax(0,1fr)_3rem_7rem_minmax(0,10rem)] items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-sm ${picked.has(a.id) ? 'bg-blue-50' : ''} ${disabled ? 'cursor-not-allowed text-slate-400' : ''}`}
        onClick={e => toggle(index, e.shiftKey)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(index, e.shiftKey); } }}>
        <input type="checkbox" tabIndex={-1} aria-hidden className="pointer-events-none" checked={picked.has(a.id)} disabled={disabled} onChange={() => {}} />
        <span className={`truncate font-mono text-xs ${disabled ? '' : 'text-blue-700'}`}>{a.code}</span>
        <span className="truncate">{a.name}</span>
        <span className="text-xs">{branchAbbr(a.branch)}</span>
        <span className="text-right">{a.setRole === 'part' ? 'รวมในชุด' : money(a.totalSatang)}</span>
        <span className={`truncate rounded-full px-2 py-0.5 text-[11px] ${hint ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
          {a.fundId ? `อยู่ในทุน "${a.fundName || ''}"` : hint ? 'แนะนำจากต้นฉบับ' : 'ยังไม่มีทุน'}
        </span>
      </div>
    );
  };
  const select = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm';
  // "เลือกทั้งหมดที่ค้นเจอ" ต้องได้ทุกรายการที่ตรงคำค้น ไม่ใช่แค่ที่แสดง 300 แถวแรก
  const visiblePickable = results.filter(canPick);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coins size={18} className="text-amber-600" />เพิ่มครุภัณฑ์เข้าทุน</DialogTitle>
          <DialogDescription>ทุน: {fund.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input aria-label="ค้นหาครุภัณฑ์" autoFocus className="h-9 w-full rounded-lg border border-blue-400 pl-8 pr-2 text-sm" placeholder="หมายเลข ชื่อ หรือเลขต้น เช่น KSU265-1610-060-008"
              value={query} onChange={e => { setQuery(e.target.value); setError(''); }} />
          </div>
          <select aria-label="สาขา" className={select} value={fBranch} onChange={e => setFBranch(e.target.value)}>
            <option value="">ทุกสาขา</option>
            {standardBranches.map(b => <option key={b} value={b}>{branchAbbr(b)}</option>)}
          </select>
          <select aria-label="ประเภท" className={select} value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">ทุกประเภท</option>
            {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={hideAssigned} onChange={e => setHideAssigned(e.target.checked)} />ซ่อนรายการที่มีทุนแล้ว</label>
        </div>
        <p className="text-xs text-slate-500">เลือกเป็นช่วง: ติ๊กรายการแรก แล้วกด Shift ค้างไว้คลิกรายการสุดท้าย</p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          {hints.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
              <Star size={13} />รายการแนะนำ — อยู่ใต้หัวทุนนี้ในไฟล์ต้นฉบับ (ยังไม่ได้ใส่จนกว่าจะติ๊ก) {hints.length} รายการ
              <button type="button" className="ml-auto font-normal text-blue-700 hover:underline" onClick={() => setMany(hints, true)}>เลือกรายการแนะนำทั้งหมด</button>
            </div>
          )}
          {hints.map((a, i) => row(a, i, true))}
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
            {q ? `ผลค้นหา "${query.trim()}" ${results.length.toLocaleString('th-TH')} รายการ${results.length > LIMIT ? ` (แสดง ${LIMIT} รายการแรก พิมพ์เพิ่มเพื่อกรอง)` : ''}` : 'พิมพ์คำค้นเพื่อหาครุภัณฑ์อื่นที่มาจากทุนนี้'}
            {visiblePickable.length > 0 && <button type="button" className="ml-auto font-normal text-blue-700 hover:underline" onClick={() => setMany(visiblePickable, !visiblePickable.every(a => picked.has(a.id)))}>
              {visiblePickable.every(a => picked.has(a.id)) ? 'ยกเลิกเลือกทั้งหมดที่ค้นเจอ' : `เลือกทั้งหมดที่ค้นเจอ (${visiblePickable.length})`}
            </button>}
          </div>
          {results.slice(0, LIMIT).map((a, i) => row(a, hints.length + i, false))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">เลือกแล้ว <b className="text-slate-900">{picked.size.toLocaleString('th-TH')} รายการ</b> · {money(sumOf(chosen))} บาท · รายการที่อยู่ทุนอื่นแล้วต้องเอาออกจากทุนเดิมก่อน</span>
          <span className="flex gap-2">
            {error && <span className="self-center text-xs text-red-600">{error}</span>}
            <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button disabled={busy} className="bg-[#2563eb] font-bold text-white hover:bg-[#1d4ed8]" onClick={save}>ใส่เข้าทุน ({picked.size})</Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
