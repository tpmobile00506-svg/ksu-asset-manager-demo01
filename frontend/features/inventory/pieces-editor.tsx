'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { codeKey, pieceCodes, pieceFormats, MAX_PIECES, type PieceFormat } from '@/shared/domain';
import type { PiecesState } from './pieces';

// ตารางหมายเลขรายชิ้น (ติด QR แยกรายชิ้น ผู้ใช้ขอ 8 พ.ย. 2569) ส่วนคำนวณอยู่ใน pieces.ts
// ใช้ 2 ที่: ฟอร์มเพิ่ม/นำเข้าครุภัณฑ์ และหน้าต่าง "แยกเป็นรายชิ้น" ของรายการกลุ่มเดิม
// ระบบไล่หมายเลขให้จากหมายเลขหลัก + รูปแบบเลขลำดับ เจ้าหน้าที่แก้รายชิ้นได้ (เก็บใน edited ตามลำดับชิ้น)

const PREVIEW_ROWS = 10;

export default function PiecesEditor({
  base,
  quantity,
  value,
  onChange,
}: {
  base: string;
  quantity: number;
  value: PiecesState;
  onChange: (next: PiecesState) => void;
}) {
  if (quantity > MAX_PIECES) {
    return (
      <div className="notice warn">
        แยกรายชิ้นได้ครั้งละไม่เกิน {MAX_PIECES.toLocaleString('th-TH')} ชิ้น ถ้ามากกว่านี้ให้ใช้ QR เดียวทั้งกลุ่ม
      </div>
    );
  }
  const codes = pieceCodes(base, value.start, quantity, value.format).map((code, i) => value.edited[i] ?? code);
  // หมายเลขซ้ำกันเอง (เทียบแบบเดียวกับเซิร์ฟเวอร์) ระบายสีให้เห็นทันที
  const counts = new Map<string, number>();
  for (const c of codes) counts.set(codeKey(c), (counts.get(codeKey(c)) ?? 0) + 1);
  const shown = value.showAll ? codes : codes.slice(0, PREVIEW_ROWS);
  const set = (patch: Partial<PiecesState>) => onChange({ ...value, ...patch });

  return (
    <div className="mt-3 space-y-3">
      <div className="form-grid">
        <label>
          <span>รูปแบบเลขลำดับชิ้น</span>
          <select
            value={value.format}
            onChange={e => set({ format: e.target.value as PieceFormat, edited: {} })}
            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs"
          >
            {Object.entries(pieceFormats).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>เริ่มที่ชิ้น</span>
          <Input
            type="number"
            min={1}
            step="1"
            value={value.start}
            onChange={e => set({ start: Math.max(1, Math.floor(Number(e.target.value) || 1)), edited: {} })}
          />
        </label>
      </div>
      {!base.trim() && (
        <p className="text-xs text-amber-700">กรอกหมายเลขหลักด้านบนก่อน ระบบจะไล่หมายเลขของแต่ละชิ้นให้</p>
      )}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          <span>ชิ้น</span>
          <span>หมายเลขครุภัณฑ์ (แก้ได้)</span>
          <span>Serial (ไม่บังคับ)</span>
        </div>
        {shown.map((code, i) => {
          const dup = (counts.get(codeKey(code)) ?? 0) > 1;
          return (
            <div
              key={i}
              className="grid grid-cols-[2rem_minmax(0,1fr)] sm:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 items-center px-3 py-1.5 border-t border-slate-100"
            >
              <span className="text-xs text-slate-500 tabular-nums">{i + 1}</span>
              <div>
                <Input
                  value={code}
                  aria-label={`หมายเลขชิ้นที่ ${i + 1}`}
                  aria-invalid={dup || !code.trim()}
                  onChange={e => set({ edited: { ...value.edited, [i]: e.target.value } })}
                  className={'h-9 font-mono text-xs ' + (dup || !code.trim() ? 'border-rose-400' : '')}
                />
                {dup && <small className="text-xs text-rose-700">หมายเลขซ้ำกับชิ้นอื่น</small>}
              </div>
              <Input
                value={value.serials[i] ?? ''}
                aria-label={`Serial ชิ้นที่ ${i + 1}`}
                placeholder="Serial"
                onChange={e => set({ serials: { ...value.serials, [i]: e.target.value } })}
                className="h-9 text-xs col-start-2 sm:col-start-auto"
              />
            </div>
          );
        })}
      </div>
      {quantity > PREVIEW_ROWS && (
        <Button type="button" variant="ghost" size="sm" onClick={() => set({ showAll: !value.showAll })}>
          {value.showAll
            ? 'ย่อรายการ'
            : `แสดงทั้งหมด ${quantity.toLocaleString('th-TH')} ชิ้น (ถึง ${codes[codes.length - 1] || '—'})`}
        </Button>
      )}
    </div>
  );
}
