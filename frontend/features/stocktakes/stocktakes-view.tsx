'use client';

import { useState, useEffect, useMemo } from 'react';
import { QrCode, Search, Plus, CheckCircle2, Clock, AlertTriangle, ScanLine, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { api, Badge, Empty, Pager, Pick, date } from '@/frontend/components/common';
import type { StocktakeItem, StocktakeResponse, WorkspaceData } from '@/shared/models';
import QrScannerModal from '@/frontend/components/qr-scanner-modal';
import { codeKey } from '@/shared/domain';
import { exportStocktakeWorkbook } from '@/frontend/services/excel-export';

// ป้ายผลตรวจนับ: สีเดียวกันทั้งตารางบนคอมและการ์ดบนมือถือ (ค่าเก่า matched = ตรงตามทะเบียน)
// ผลที่ถือว่า "มีปัญหา" ต้องตามต่อ (ชำรุด ไม่พบ ข้อมูลไม่ตรง)
const PROBLEM = new Set(['damaged', 'repair', 'missing', 'mismatch']);
type ResultFilter = 'all' | 'pending' | 'checked' | 'problem';
const roomOf = (i: StocktakeItem): string => {
  try {
    return String(JSON.parse(i.snapshot || '{}').location || '').trim();
  } catch {
    return '';
  }
};
const checkResults: Record<string, { label: string; style: string }> = {
  normal: { label: 'ตรงตามทะเบียน', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  matched: { label: 'ตรงตามทะเบียน', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  damaged: { label: 'พบแต่ชำรุด', style: 'bg-orange-50 text-orange-700 border-orange-200' },
  missing: { label: 'ไม่พบ', style: 'bg-rose-50 text-rose-700 border-rose-200' },
  mismatch: { label: 'ข้อมูลไม่ตรง', style: 'bg-purple-50 text-purple-700 border-purple-200' },
  pending: { label: 'ยังไม่ตรวจ', style: 'bg-slate-100 text-slate-700 border-slate-200' },
};
function CheckResultBadge({ result, className = 'text-xs' }: { result: string; className?: string }) {
  const r = checkResults[result] || checkResults.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold border ${r.style} ${className}`}>
      {r.label}
    </span>
  );
}

export default function StocktakesView({
  data,
  open,
  write,
  busy,
  revision,
}: {
  data: Pick<WorkspaceData, 'me' | 'rounds'>;
  open: (k: string, a?: Record<string, unknown>) => void;
  write: (b: Record<string, unknown>) => Promise<unknown>;
  busy: boolean;
  revision: number;
}) {
  const [roundId, setRoundId] = useState('');
  const [loadedRound, setLoadedRound] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<StocktakeItem[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [room, setRoom] = useState('all');

  const editable = ['staff', 'admin'].includes(data.me.role);
  const round = data.rounds.find(r => r.id === roundId);

  useEffect(() => {
    if (!roundId && data.rounds.length) {
      setRoundId(data.rounds[0].id);
    }
  }, [data.rounds, roundId]);

  useEffect(() => {
    setPage(0);
  }, [search, roundId, resultFilter, room]);
  // เปลี่ยนรอบ = ห้องของรอบเดิมอาจไม่มี จึงล้างตัวกรองห้อง
  useEffect(() => {
    setRoom('all');
  }, [roundId]);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setLoadedRound('');
    if (!roundId) return;

    setItemsLoading(true);
    api<StocktakeResponse>('?view=stocktake&round=' + encodeURIComponent(roundId))
      .then(r => {
        if (!cancelled) {
          setItems(r.items);
          setLoadedRound(roundId);
        }
      })
      .catch(e => {
        if (!cancelled) toast.error(e.message);
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roundId, revision]);

  const current = useMemo(() => (loadedRound === roundId ? items : []), [items, loadedRound, roundId]);
  const rooms = useMemo(
    () => Array.from(new Set(current.map(roomOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')),
    [current],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return current.filter(i => {
      if (resultFilter === 'pending' && i.result !== 'pending') return false;
      if (resultFilter === 'checked' && i.result === 'pending') return false;
      if (resultFilter === 'problem' && !PROBLEM.has(i.result)) return false;
      if (room !== 'all' && roomOf(i) !== room) return false;
      return !q || (i.code + ' ' + i.name + ' ' + (i.notes || '') + ' ' + roomOf(i)).toLowerCase().includes(q);
    });
  }, [current, search, resultFilter, room]);

  const stats = useMemo(() => {
    const total = round?.total || 0;
    const checked = round?.checked || 0;
    const percent = total > 0 ? ((checked / total) * 100).toFixed(1) : '0.0';
    const normalCount = items.filter(i => i.result === 'normal' || i.result === 'matched').length;
    const damagedCount = items.filter(i => PROBLEM.has(i.result)).length;
    const pendingCount = Math.max(0, total - checked);

    return { total, checked, percent, normalCount, damagedCount, pendingCount };
  }, [round, items]);

  const handleScanQr = () => {
    if (!round) {
      toast.warning('เลือกรอบตรวจนับก่อนสแกน');
      return;
    }
    if (itemsLoading || loadedRound !== roundId) {
      toast.info('กำลังโหลดรายการในรอบนี้ รอสักครู่…');
      return;
    }
    setScannerOpen(true);
  };

  const handleScannedCode = (scannedText: string) => {
    let cleanCode = scannedText.trim();
    // แยก query parameter ?asset= หรือ &asset= ในกรณีที่เป็น URL จาก QR sticker
    try {
      if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
        const url = new URL(cleanCode);
        const assetParam = url.searchParams.get('asset');
        if (assetParam) {
          cleanCode = assetParam;
        }
      } else {
        const match = cleanCode.match(/[?&]asset=([^&]+)/);
        if (match) {
          cleanCode = decodeURIComponent(match[1]);
        }
      }
    } catch {
      // ignore URL parsing error
    }

    const target = cleanCode.toLowerCase();
    const rawTarget = scannedText.trim().toLowerCase();

    const found = items.find(i => {
      if (i.assetId && i.assetId.toLowerCase() === target) return true;
      if (i.id && i.id.toLowerCase() === target) return true;
      // หมายเลขครุภัณฑ์เทียบแบบไม่สนตัวพิมพ์และช่องว่าง (เหมือนการตรวจรหัสซ้ำ)
      if (i.code && (codeKey(i.code) === codeKey(cleanCode) || codeKey(i.code) === codeKey(scannedText))) return true;
      try {
        const snap = JSON.parse(i.snapshot || '{}');
        if (snap.serial && snap.serial.toLowerCase() === target) return true;
        if (snap.serial && snap.serial.toLowerCase() === rawTarget) return true;
      } catch {}
      return false;
    });

    if (found) {
      setScannerOpen(false);
      if (editable && round?.status === 'open') {
        open('check', { item: found });
        toast.success(`พบครุภัณฑ์: ${found.name}`, {
          description: `หมายเลข: ${found.code}`,
        });
      } else {
        setSearch(found.code);
        toast.info(`พบครุภัณฑ์: ${found.name}`, {
          description: round?.status !== 'open' ? 'รอบนี้ปิดแล้ว' : `หมายเลข: ${found.code}`,
        });
      }
      return true;
    } else {
      toast.error('ไม่พบครุภัณฑ์ในรอบตรวจนับนี้', {
        description: `ค่าที่สแกนได้: ${scannedText}`,
      });
      return false;
    }
  };

  return (
    <div className={`space-y-6 animate-in fade-in duration-200 ${round ? 'pb-24 md:pb-0' : ''}`}>
      {/* Controls Row */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* กว้างตั้งต้น 36rem: ถ้าวางคู่กับกลุ่มปุ่มไม่พอ ให้ปุ่มตกลงบรรทัดใหม่ ไม่ใช่ทับกัน */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-[1_1_36rem] min-w-0">
          {/* Round Selector Dropdown */}
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 sm:shrink-0">
            <span className="font-bold whitespace-nowrap">รอบตรวจนับ:</span>
            <select
              aria-label="รอบตรวจนับ"
              value={roundId}
              onChange={e => setRoundId(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold text-blue-700 border-none outline-none cursor-pointer sm:max-w-[240px] truncate"
            >
              {data.rounds.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.year}) · {r.status === 'open' ? 'เปิดอยู่' : 'ปิดรอบแล้ว'}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[11rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="ค้นหาหมายเลข ชื่อ ห้อง หรือหมายเหตุ"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50/60 border-slate-200 focus:bg-white w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scan QR Button */}
          <Button
            onClick={handleScanQr}
            className="hidden md:inline-flex h-10 px-5 text-sm font-bold bg-[#0369a1] hover:bg-[#075985] text-white shadow-sm cursor-pointer"
          >
            <ScanLine size={17} className="mr-1.5" /> สแกน QR
          </Button>

          {/* รายงานผลต่างการตรวจนับ (ขาด/เกิน) ตามข้อกำหนดโมดูลตรวจนับ */}
          {round && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || itemsLoading || loadedRound !== roundId || !items.length}
              onClick={async () => {
                try {
                  toast.info('กำลังสร้างไฟล์ Excel...');
                  await exportStocktakeWorkbook(round, items);
                  toast.success('ส่งออกรายงานผลตรวจนับ (ขาด/เกิน) เรียบร้อยแล้ว');
                } catch (e: any) {
                  toast.error(e.message || 'เกิดข้อผิดพลาดในการส่งออก Excel');
                }
              }}
              className="flex-1 sm:flex-initial h-9 px-3 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 shadow-xs cursor-pointer"
              title="ส่งออกผลตรวจนับและผลต่าง (ขาด/เกิน) ของรอบนี้เป็นไฟล์ Excel"
            >
              <Download size={14} className="mr-1.5 text-emerald-600" /> ส่งออกผลต่าง Excel
            </Button>
          )}

          {/* Open New Round Button */}
          {editable && (
            <Button
              size="sm"
              onClick={() => open('round')}
              className="flex-1 sm:flex-initial h-9 px-3 text-xs font-bold bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-sm cursor-pointer"
            >
              <Plus size={15} className="mr-1" /> เปิดรอบใหม่
            </Button>
          )}

          {/* Close Round Button */}
          {editable && round && round.status === 'open' && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || itemsLoading || loadedRound !== roundId || round.checked !== round.total}
              onClick={() => write({ action: 'closeRound', id: round.id })}
              className="h-9 px-3 text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-300 cursor-pointer disabled:cursor-not-allowed"
              title={round.checked !== round.total ? 'ต้องตรวจให้ครบทุกรายการก่อนปิดรอบ' : 'ปิดรอบนี้และสรุปผล'}
            >
              ปิดรอบนี้
            </Button>
          )}
        </div>
      </div>

      {editable && round && round.status === 'open' && round.checked !== round.total && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>
            ยังปิดรอบไม่ได้ ต้องตรวจให้ครบก่อน เหลืออีก{' '}
            <b>{(round.total - round.checked).toLocaleString('th-TH')}</b> รายการ
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => setResultFilter('pending')}
          >
            ดูรายการที่ยังไม่ตรวจ
          </Button>
        </div>
      )}

      {/* การ์ดสรุป 4 ใบ · การ์ด "ยังไม่ตรวจ" และ "มีปัญหา" กดแล้วกรองรายการให้ */}
      {round && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Card 1: ตรวจพบแล้ว + Progress bar */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[11px] sm:text-xs text-slate-600 font-medium">ตรวจแล้ว</span>
              <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-200">
                {stats.percent}%
              </span>
            </div>
            <strong className="text-lg sm:text-2xl font-bold text-slate-900 block mb-2 leading-none">
              {stats.checked.toLocaleString('th-TH')}{' '}
              <span className="text-xs sm:text-sm font-normal text-slate-600">
                / {stats.total.toLocaleString('th-TH')}
              </span>
            </strong>
            <Progress value={Number(stats.percent)} className="h-1.5 sm:h-2 bg-slate-100" />
          </div>

          {/* Card 2: ยังไม่ตรวจ (กดเพื่อกรอง) */}
          <button
            type="button"
            onClick={() => setResultFilter(resultFilter === 'pending' ? 'all' : 'pending')}
            aria-pressed={resultFilter === 'pending'}
            className={`text-left bg-white rounded-xl border p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-3.5 cursor-pointer hover:border-slate-400 ${resultFilter === 'pending' ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-200/80'}`}
          >
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
              <Clock size={18} className="sm:hidden" />
              <Clock size={22} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs text-slate-600 font-medium block truncate">ยังไม่ตรวจ</span>
              <strong className="text-base sm:text-xl font-bold text-slate-800 block leading-tight">
                {stats.pendingCount.toLocaleString('th-TH')}
              </strong>
              <span className="text-[10px] sm:text-[11px] text-slate-600 block mt-0.5 truncate">กดเพื่อดูรายการ</span>
            </div>
          </button>

          {/* Card 3: สภาพปกติ */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-3.5">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <CheckCircle2 size={18} className="sm:hidden stroke-[2.5]" />
              <CheckCircle2 size={22} className="hidden sm:block stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs text-slate-600 font-medium block truncate">ตรงตามทะเบียน</span>
              <strong className="text-base sm:text-xl font-bold text-emerald-700 block leading-tight">
                {stats.normalCount.toLocaleString('th-TH')}
              </strong>
            </div>
          </div>

          {/* Card 4: มีปัญหา (กดเพื่อกรอง) */}
          <button
            type="button"
            onClick={() => setResultFilter(resultFilter === 'problem' ? 'all' : 'problem')}
            aria-pressed={resultFilter === 'problem'}
            className={`text-left bg-white rounded-xl border p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-3.5 cursor-pointer hover:border-slate-400 ${resultFilter === 'problem' ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-200/80'}`}
          >
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle size={18} className="sm:hidden" />
              <AlertTriangle size={22} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs text-slate-600 font-medium block truncate">มีปัญหา</span>
              <strong className="text-base sm:text-xl font-bold text-rose-700 block leading-tight">
                {stats.damagedCount.toLocaleString('th-TH')}
              </strong>
              <span className="text-[10px] sm:text-[11px] text-rose-800 block mt-0.5 truncate">ชำรุด ไม่พบ หรือไม่ตรง</span>
            </div>
          </button>
        </div>
      )}

      {/* Stocktake Table & Mobile Card View */}
      {round ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">{round.name}</h2>
              <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5">
                ปีงบประมาณ {round.year} · ตรวจแล้ว {round.checked} / {round.total} รายการ
              </p>
            </div>
            <Badge value={round.status} />
          </div>
          <div className="px-3.5 sm:px-4 py-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:max-w-xl">
            <Pick
              label="ผลตรวจ"
              value={resultFilter}
              onChange={v => setResultFilter(v as ResultFilter)}
              options={[
                ['all', `ทุกผล (${current.length.toLocaleString('th-TH')})`],
                ['pending', `ยังไม่ตรวจ (${current.filter(i => i.result === 'pending').length.toLocaleString('th-TH')})`],
                ['checked', 'ตรวจแล้ว'],
                ['problem', 'มีปัญหา (ชำรุด / ไม่พบ / ไม่ตรง)'],
              ]}
            />
            <Pick
              label="ห้อง"
              value={room}
              onChange={setRoom}
              options={[['all', 'ทุกห้อง'], ...rooms.map(r => [r, r] as [string, string])]}
            />
          </div>

          {itemsLoading ? (
            <div className="p-12 text-center text-xs text-slate-600">กำลังโหลดรายการในรอบนี้…</div>
          ) : filtered.length ? (
            <>
              {/* Desktop Table View (md and up) */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                      <TableHead className="font-bold">หมายเลขครุภัณฑ์</TableHead>
                      <TableHead className="font-bold">รายการ / ห้อง</TableHead>
                      <TableHead className="font-bold text-center">ตามทะเบียน</TableHead>
                      <TableHead className="font-bold text-center">พบจริง</TableHead>
                      <TableHead className="font-bold text-center">ผลตรวจ</TableHead>
                      <TableHead className="font-bold">บันทึกเมื่อ</TableHead>
                      <TableHead className="font-bold text-center w-[120px]">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(page * 40, (page + 1) * 40).map(i => {
                      const snap = JSON.parse(i.snapshot || '{}');
                      const isChecked = i.result !== 'pending';

                      return (
                        <TableRow key={i.id} className="hover:bg-slate-50/60 transition-colors">
                          <TableCell className="font-mono text-xs font-bold text-blue-700 select-all whitespace-nowrap">
                            {i.code}
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-xs text-slate-900 line-clamp-1">{i.name}</div>
                            <div className="text-[11px] text-slate-600 line-clamp-1">{snap.location || '—'}</div>
                          </TableCell>
                          <TableCell className="text-center font-medium text-xs text-slate-600 whitespace-nowrap">
                            {snap.quantity ?? 1}
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs text-slate-900 whitespace-nowrap">
                            {i.quantity ?? '—'}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <CheckResultBadge result={i.result} />
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                            {i.checkedAt ? date(i.checkedAt) : '—'}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            {editable && round.status === 'open' && (
                              <Button
                                size="sm"
                                variant={isChecked ? 'ghost' : 'outline'}
                                onClick={() => open('check', { item: i })}
                                className={`h-8 px-3 text-xs font-bold cursor-pointer ${
                                  isChecked
                                    ? 'text-slate-600 hover:text-blue-600'
                                    : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8] border-none shadow-sm'
                                }`}
                              >
                                {isChecked ? 'แก้ไขผล' : 'บันทึกผล'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards View (Below md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filtered.slice(page * 40, (page + 1) * 40).map(i => {
                  const snap = JSON.parse(i.snapshot || '{}');
                  const isChecked = i.result !== 'pending';

                  return (
                    <div key={i.id} className="p-3.5 hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 select-all">
                          {i.code}
                        </span>
                        <CheckResultBadge result={i.result} className="text-[11px]" />
                      </div>

                      <div className="font-bold text-sm text-slate-900 leading-snug">{i.name}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{snap.location || '—'}</div>

                      <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-slate-100 text-xs">
                        <div>
                          <span className="text-slate-600 text-[10.5px] block">ตามทะเบียน / พบจริง</span>
                          <span className="font-semibold text-slate-800">
                            {snap.quantity ?? 1} / <strong className="text-blue-700">{i.quantity ?? '—'}</strong> ชิ้น
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-600 text-[10.5px] block">หมายเหตุ</span>
                          <span className="font-semibold text-slate-800">{isChecked ? i.notes || '—' : '—'}</span>
                        </div>
                      </div>

                      {editable && round.status === 'open' && (
                        <div className="mt-3 pt-2 border-t border-slate-100">
                          <Button
                            size="sm"
                            variant={isChecked ? 'outline' : 'default'}
                            onClick={() => open('check', { item: i })}
                            className={`w-full h-10 text-sm font-bold cursor-pointer shadow-xs ${
                              isChecked
                                ? 'text-slate-700 hover:text-blue-600 border-slate-200'
                                : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                            }`}
                          >
                            {isChecked ? 'แก้ไขผล' : 'บันทึกผล'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  แสดงรายการที่ {page * 40 + 1} - {Math.min((page + 1) * 40, filtered.length)} จากทั้งหมด{' '}
                  {filtered.length} รายการ
                </span>
                <Pager page={page} total={filtered.length} onChange={setPage} />
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <Empty title={resultFilter === 'pending' && !search && room === 'all' ? 'ตรวจครบทุกรายการแล้ว' : 'ไม่พบรายการตามตัวกรองนี้'}>
                <p className="text-xs text-slate-600 mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
              </Empty>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mx-auto mb-4">
            <QrCode size={32} />
          </div>
          {/* globals.css ตั้ง `h1,h2,h3,p { margin: 0 }` แบบไม่อยู่ใน @layer จึงชนะ mx-auto/mb-* ปกติ ต้องใช้ ! */}
          <h3 className="text-base font-bold text-slate-800 mb-1!">ยังไม่มีรอบตรวจนับครุภัณฑ์</h3>
          <p className="text-xs text-slate-600 mb-5! max-w-sm mx-auto!">
            เปิดรอบแล้วเจ้าหน้าที่สแกนป้าย QR และบันทึกผลได้ทันที
          </p>
          {editable && (
            <Button
              onClick={() => open('round')}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold cursor-pointer px-6"
            >
              <Plus size={16} className="mr-2" /> เปิดรอบตรวจนับแรก
            </Button>
          )}
        </div>
      )}

      {/* มือถือ: ปุ่มสแกนติดล่างจอ กดได้ทุกเมื่อโดยไม่ต้องเลื่อนกลับขึ้นไปด้านบน */}
      {round && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
          <Button
            onClick={handleScanQr}
            className="w-full h-12 text-base font-bold bg-[#0369a1] hover:bg-[#075985] text-white cursor-pointer"
          >
            <ScanLine size={20} className="mr-2" /> สแกน QR
          </Button>
        </div>
      )}

      {/* QR Scanner Modal with Camera and File Fallback */}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannedCode}
        title={round ? `สแกนตรวจนับ: ${round.name}` : 'สแกนป้าย QR'}
        description="ส่องกล้องไปที่ป้าย QR ของครุภัณฑ์"
      />
    </div>
  );
}
