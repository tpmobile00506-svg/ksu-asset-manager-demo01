'use client';
import { useState } from 'react';
import { FileSpreadsheet, Trash2, Archive, ArchiveRestore, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportFileRecord } from '@/shared/models';

// เวลาอัปโหลดเก็บเป็น ISO (UTC) แสดงเป็นวันที่ไทยตามเวลาเครื่อง เช่น "17 ต.ค. 69"
const uploadedOn = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''; };

// รายการไฟล์ต้นฉบับ Excel: เลือกไฟล์เพื่อตรวจทาน · ลบ (ยังไม่นำเข้า) · เก็บเข้าคลัง / นำกลับ (นำเข้าแล้ว)
export default function SourceFileList({ files, selectedId, editable, busy, onSelect, onDelete, onArchive }: {
  files: ImportFileRecord[];
  selectedId: string;
  editable: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onDelete: (file: ImportFileRecord) => void;
  onArchive: (file: ImportFileRecord, archived: boolean) => void;
}) {
  const [showArchive, setShowArchive] = useState(false);
  const active = files.filter(f => !f.archived);
  const archived = files.filter(f => f.archived);

  const row = (f: ImportFileRecord) => {
    const selected = f.id === selectedId;
    return (
      <li key={f.id} className={`flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
        <button type="button" onClick={() => onSelect(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer" aria-current={selected}>
          <FileSpreadsheet size={16} className="shrink-0 text-emerald-600" />
          <span className={`truncate text-sm ${selected ? 'font-semibold text-blue-800' : 'text-slate-800'}`} title={f.name}>{f.name}</span>
        </button>
        <span className="hidden sm:inline shrink-0 text-xs text-slate-500">{uploadedOn(f.createdAt)}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${f.importedCount ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
          {f.importedCount ? `นำเข้าแล้ว ${f.importedCount.toLocaleString('th-TH')} แถว` : 'ยังไม่นำเข้า'}
        </span>
        {editable && (f.archived
          ? <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={busy} onClick={() => onArchive(f, false)}><ArchiveRestore size={13} />นำกลับ</Button>
          : f.importedCount
            ? <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={busy} onClick={() => onArchive(f, true)}><Archive size={13} />เก็บเข้าคลัง</Button>
            : <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => onDelete(f)}><Trash2 size={13} />ลบไฟล์</Button>)}
      </li>
    );
  };

  return (
    <div className="w-full">
      {active.length
        ? <ul className="rounded-lg border border-slate-200 bg-white">{active.map(row)}</ul>
        : <p className="text-sm text-slate-500">ไม่มีไฟล์ในรายการหลัก{archived.length ? ' (ดูได้ในคลังไฟล์)' : ''}</p>}
      {archived.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowArchive(v => !v)} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer">
            <ChevronRight size={13} className={`transition-transform ${showArchive ? 'rotate-90' : ''}`} />
            คลังไฟล์ ({archived.length.toLocaleString('th-TH')} ไฟล์)
          </button>
          {showArchive && <ul className="mt-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50/60">{archived.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
