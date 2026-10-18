'use client';

// มุมมองนำเข้าแบบ Excel: เปิดแผ่นงานของไฟล์ต้นฉบับเหมือนใน Excel แล้วเลือกครุภัณฑ์ด้วยการติ๊ก
// ลากครอบที่หัวแถว หรือ Shift+คลิก (ผู้ใช้ขอ 16 ต.ค. 2569) แถวที่มีปัญหาเลือกรวมไม่ได้ ต้องเปิดตรวจทีละแถว
import { useEffect, useRef, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Pager } from '@/frontend/components/common';
import { rowOverrideLabels, type Candidate, type RowOverride } from '@/shared/domain';
import type { SourceViewResponse } from '@/shared/imports';

type Row = Candidate & { done: boolean };
type Props = {
  sourceId: string;
  sheets: string[];
  revision: number;
  canImport: boolean;
  onImport: (keys: string[], assets: number, linking: number) => void;
  onReview: (row: Row) => void;
  onOverride: (keys: string[], as: RowOverride | 'auto') => Promise<boolean>;
};

const PAGE = 500;
const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
// ค่าจากเซลล์ Excel: สูตรใช้ค่าที่คำนวณไว้ ข้อความหลายรูปแบบรวมเป็นข้อความเดียว ตัวเลขใส่ลูกน้ำ
function show(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('th-TH');
  if (typeof value === 'object') {
    const v = value as { cached?: unknown; result?: unknown; richText?: Array<{ text: string }>; text?: unknown };
    if ('cached' in v) return show(v.cached);
    if ('result' in v) return show(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.text !== undefined) return show(v.text);
    return '';
  }
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('th-TH') : value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
}
const isNumber = (value: unknown) => typeof value === 'number' || (typeof value === 'object' && value !== null && typeof (value as { cached?: unknown }).cached === 'number');
// แถวหัวกระดาษ/หัวทุนที่มีข้อความช่องเดียว ให้ข้อความล้นไปช่องว่างทางขวาแบบ Excel (ไม่ดันคอลัมน์ให้กว้าง)
function cells(r: Row, cols: number) {
  const text = Array.from({ length: cols }, (_, i) => show(r.values[i]));
  const filled = text.map((t, i) => (t ? i : -1)).filter(i => i >= 0);
  // หัวกระดาษ/หัวทุนที่ข้อความกระจายหลายช่อง (ไม่ใช่หัวตาราง) รวมเป็นบรรทัดเดียว
  if (r.kind !== 'asset' && filled.length && (filled.length <= 2 || r.kind === 'group')) {
    const at = filled[0];
    return [
      ...Array.from({ length: at }, (_, c) => <td key={c} />),
      <td key={at} colSpan={cols - at} className="span">{filled.map(i => text[i].trim()).join('   ')}</td>,
    ];
  }
  return text.map((t, c) => <td key={c} className={isNumber(r.values[c]) ? 'num' : ''} title={t.length > (c === 0 ? 6 : 30) ? t : undefined}><div className="cell">{t}</div></td>);
}
// ติ๊กได้ทุกแถวที่ยังไม่นำเข้า (แถวสีเทาเลือกไว้ "เปลี่ยนเป็น..." ได้) แต่นำเข้าได้เฉพาะแถวครุภัณฑ์
// แถว "ต้องตรวจ" นำเข้าพร้อมหมายเหตุให้ตามแก้
const selectable = (r: Row) => !r.done;
const importable = (r: Row) => r.kind === 'asset' && !r.done;
function state(r: Row): { label: string; tone: string } {
  if (r.override === 'continue') return { label: 'บรรทัดต่อ', tone: 'heading' };
  if (r.override === 'skip') return { label: 'ข้าม', tone: 'meta' };
  if (r.kind === 'group') return { label: 'หัวทุน', tone: 'heading' };
  if (r.kind !== 'asset') return { label: r.kind === 'subtotal' ? 'ยอดยก' : 'หัวกระดาษ', tone: 'meta' };
  if (r.done) return { label: 'นำเข้าแล้ว', tone: 'done' };
  if (r.issue) return { label: 'ต้องตรวจ', tone: 'issue' };
  if (r.set?.role === 'header') return { label: 'หัวชุด', tone: 'ready' };
  return { label: 'พร้อม', tone: 'ready' };
}

export default function SourceSheetGrid({ sourceId, sheets, revision, canImport, onImport, onReview, onOverride }: Props) {
  const [sheet, setSheet] = useState(sheets[0] || '');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SourceViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ลากครอบ: จำแถวเริ่ม โหมด (เลือก/ยกเลิก) และสิ่งที่เลือกไว้ก่อนเริ่มลาก
  const drag = useRef<{ from: number; add: boolean; base: Set<string> } | null>(null);
  const anchor = useRef<number | null>(null);

  useEffect(() => { if (!sheets.includes(sheet)) setSheet(sheets[0] || ''); }, [sheets, sheet]);
  useEffect(() => { setPage(0); anchor.current = null; }, [sheet, sourceId]);
  useEffect(() => { setSelected(new Set()); }, [sourceId, revision]);

  useEffect(() => {
    if (!sourceId || !sheet) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const q = new URLSearchParams({ view: 'source', source: sourceId, sheet, kind: 'all', grid: '1', page: String(page) });
    api<SourceViewResponse>('?' + q.toString(), undefined, { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setData(r); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'โหลดแผ่นงานไม่สำเร็จ'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sourceId, sheet, page, revision]);

  useEffect(() => {
    const stop = () => { drag.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const rows = data && data.rows.every(r => r.sheet === sheet) ? data.rows : [];
  const cols = Math.min(13, Math.max(11, ...rows.map(r => r.values.length)));

  function applyRange(from: number, to: number, add: boolean, base: Set<string>) {
    const next = new Set(base);
    for (const r of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      if (!selectable(r)) continue;
      if (add) next.add(r.key); else next.delete(r.key);
    }
    setSelected(next);
  }
  function pressRow(index: number, shift: boolean) {
    const r = rows[index];
    if (shift && anchor.current !== null) {
      applyRange(anchor.current, index, true, selected);
      return;
    }
    if (!selectable(r)) return;
    const add = !selected.has(r.key);
    drag.current = { from: index, add, base: new Set(selected) };
    anchor.current = index;
    applyRange(index, index, add, selected);
  }
  function enterRow(index: number) {
    if (drag.current) applyRange(drag.current.from, index, drag.current.add, drag.current.base);
  }
  const readyHere = rows.filter(r => importable(r) && !r.issue);
  // หัวทุนที่ติ๊กส่งไปด้วย: ครุภัณฑ์ใต้หัวทุนที่เลือกมาด้วยกันจะผูกเข้าทุนทันที
  const pickedAssets = rows.filter(r => selected.has(r.key) && importable(r));
  const pickedFunds = rows.filter(r => selected.has(r.key) && r.kind === 'group');
  const toImport = pickedAssets.length ? [...pickedAssets, ...pickedFunds].map(r => r.key) : [];
  const linking = pickedAssets.filter(r => r.fund && pickedFunds.some(f => f.key === r.fund!.key)).length;
  const [changing, setChanging] = useState(false);
  async function change(as: RowOverride | 'auto') {
    setChanging(true);
    try { if (await onOverride([...selected], as)) setSelected(new Set()); } finally { setChanging(false); }
  }

  return (
    <div className="xls">
      <div className="xls-bar">
        <span className="xls-count">เลือกแล้ว <b>{selected.size.toLocaleString('th-TH')}</b> แถว</span>
        <span className="xls-hint">ลากที่เลขแถวเพื่อครอบ · Shift+คลิกเลือกเป็นช่วง · ติ๊กทีละแถว · แถวสีเหลืองนำเข้าได้ ระบบติดหมายเหตุ "ต้องตรวจ" ให้</span>
        <div className="xls-actions">
          <Button size="sm" variant="outline" disabled={!readyHere.length} onClick={() => setSelected(new Set([...selected, ...readyHere.map(r => r.key)]))}>
            เลือกที่พร้อมในหน้านี้ ({readyHere.length})
          </Button>
          {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X size={14} />ล้าง</Button>}
          {/* เปลี่ยนประเภทแถวที่เลือก เมื่อระบบเดาผิด (เช่น ข้อความตกบรรทัดกลายเป็นหัวกระดาษ) */}
          <select aria-label="เปลี่ยนแถวที่เลือกเป็น" className="xls-change" value="" disabled={!canImport || !selected.size || changing}
            onChange={e => { const v = e.target.value as RowOverride | 'auto'; if (v) void change(v); }}>
            <option value="">{changing ? 'กำลังเปลี่ยน…' : 'เปลี่ยนเป็น…'}</option>
            {(Object.keys(rowOverrideLabels) as RowOverride[]).map(k => <option key={k} value={k}>{rowOverrideLabels[k]}</option>)}
            <option value="auto">กลับเป็นค่าที่ระบบเดา</option>
          </select>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!canImport || !toImport.length} onClick={() => onImport(toImport, pickedAssets.length, linking)}>
            <Zap size={14} /> นำเข้า {pickedAssets.length.toLocaleString('th-TH')} รายการ{linking ? ` · ผูกกับหัวทุน ${linking}` : ''}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="xls-error">{error}</p>}
      <div className={`xls-scroll ${loading ? 'is-loading' : ''}`}>
        <table className="xls-grid">
          <thead>
            <tr>
              <th className="xls-corner" />
              {letters(cols).map(l => <th key={l}>{l}</th>)}
              <th className="xls-state-h">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, index) => {
              const st = state(r), can = selectable(r), on = selected.has(r.key);
              return (
                <tr key={r.key} className={`tone-${st.tone} ${on ? 'is-on' : ''}`}
                  onPointerEnter={() => enterRow(index)}
                  title={r.issue || (r.fund ? 'หัวทุน: ' + r.fund.name : undefined)}>
                  <th className={`xls-rowhead ${can ? 'can' : ''}`}
                    onPointerDown={e => { e.preventDefault(); pressRow(index, e.shiftKey); }}>
                    <input type="checkbox" className="select-check" aria-label={`เลือกแถว ${r.row}`} checked={on} disabled={!can} readOnly tabIndex={-1} />
                    <span>{r.row}</span>
                  </th>
                  {cells(r, cols)}
                  <td className="xls-state">
                    {st.tone === 'issue'
                      ? <button type="button" className="xls-chip issue" onClick={() => onReview(r)}>ต้องตรวจ · เปิดดู</button>
                      : <span className={`xls-chip ${st.tone}`}>{st.label}</span>}
                    {r.override && <span className="xls-edited" title="เจ้าหน้าที่เปลี่ยนประเภทแถวนี้เอง">แก้</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && !loading && <p className="xls-empty">ไม่มีข้อมูลในแผ่นนี้</p>}
      </div>
      {data && data.total > PAGE && <Pager page={page} total={data.total} size={PAGE} onChange={setPage} />}

      <div className="xls-tabs" role="tablist" aria-label="แผ่นงาน">
        {sheets.map(s => (
          <button key={s} type="button" role="tab" aria-selected={s === sheet} className={s === sheet ? 'on' : ''} onClick={() => setSheet(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}
