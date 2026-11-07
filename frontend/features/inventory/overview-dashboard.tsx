'use client';
import { Check, FileCheck2, Package, TriangleAlert } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { pieceSummary, requestTypes, thaiDateTime, type Asset } from '@/shared/domain';
import { Badge, baht, type Any } from '@/frontend/components/common';
import type { WorkspaceData } from '@/frontend/types/models';
import dynamic from 'next/dynamic';

// กราฟใช้ไลบรารี recharts ขนาดใหญ่ (ราวครึ่งของไฟล์ JavaScript ตอนเปิดเว็บ) จึงโหลดเฉพาะเมื่อเปิดหน้าภาพรวม
// ระหว่างโหลดแสดงกรอบว่างขนาดเท่ากราฟ หน้าไม่กระโดด
const OverviewCharts = dynamic(() => import('./overview-charts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 min-h-[360px] animate-pulse" />
      <div className="bg-white rounded-xl border border-slate-200 p-6 min-h-[360px] animate-pulse" />
    </div>
  ),
});

// หน้าภาพรวม: การ์ดตัวเลข 4 ใบ (นับเป็นชิ้น) → กราฟ → ตารางคำขอล่าสุด 5 รายการ
// ตัวเลขทุกตัวคำนวณจากข้อมูลที่โหลดมาแล้วในเครื่อง (ไม่เรียก API เพิ่ม)
export function OverviewDashboard({
  data,
  assets,
  active,
  total,
  pending,
  onSelectBranch,
  onOpenView,
  onOpenAsset,
}: {
  data: WorkspaceData;
  assets: Asset[];
  active: Asset[];
  total: number; // มูลค่ารวมของรายการที่ใช้งาน (สตางค์)
  pending: Any[];
  onSelectBranch: (branch: string) => void;
  onOpenView: (view: string) => void;
  onOpenAsset: (asset: Asset) => void;
}) {
  const pieces = pieceSummary(active);
  return (
    <>
      {/* การ์ด 4 ใบ: นับเป็นชิ้นเป็นหลัก บรรทัดรองบอกจำนวนรายการ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Package size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-600 font-medium block">ครุภัณฑ์ที่ใช้อยู่</span>
            <strong className="text-xl font-bold text-slate-900 block leading-tight">
              {pieces.total.toLocaleString('th-TH')} ชิ้น
            </strong>
            <span className="text-[11px] text-slate-600 block mt-0.5">
              {pieces.items.toLocaleString('th-TH')} รายการ · มูลค่ารวม {baht(total)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Check size={22} className="stroke-[3]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-600 font-medium block">ปกติ</span>
            <strong className="text-xl font-bold text-emerald-700 block leading-tight">
              {pieces.normal.toLocaleString('th-TH')} ชิ้น
            </strong>
            <span className="text-[11px] text-emerald-800 block mt-0.5">
              {pieces.total ? ((pieces.normal / pieces.total) * 100).toFixed(1) : '0.0'}% ของทั้งหมด
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <TriangleAlert size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-600 font-medium block">ชำรุด / กำลังซ่อม</span>
            <strong className="text-xl font-bold text-rose-700 block leading-tight">
              {(pieces.damaged + pieces.repair).toLocaleString('th-TH')} ชิ้น
            </strong>
            <span className="text-[11px] text-rose-800 block mt-0.5">
              ชำรุด {pieces.damaged.toLocaleString('th-TH')} · กำลังซ่อม {pieces.repair.toLocaleString('th-TH')}
              {pieces.missing ? ` · ไม่พบ ${pieces.missing.toLocaleString('th-TH')}` : ''}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <FileCheck2 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-600 font-medium block">คำขอรออนุมัติ</span>
            <strong className="text-xl font-bold text-amber-700 block leading-tight">{pending.length} คำขอ</strong>
            <span className="text-[11px] text-amber-800 block mt-0.5">
              โอนย้าย {pending.filter((r: Any) => r.kind === 'transfer').length} · ส่งซ่อม{' '}
              {pending.filter((r: Any) => r.kind === 'repair').length} · จำหน่าย{' '}
              {pending.filter((r: Any) => r.kind === 'disposal' || r.kind === 'dispose').length}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <OverviewCharts assets={assets} onSelectBranch={onSelectBranch} />

      {/* Bottom Section: Recent Activities & Requests Table matching desktop_2_dashboard.svg */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mb-6">
        <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">คำขอล่าสุด</h2>
            <p className="text-xs text-slate-600 mt-0.5">โอนย้าย ส่งซ่อม และจำหน่าย 5 รายการล่าสุด</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenView('requests')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            ดูคำขอทั้งหมด →
          </button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                <TableHead className="font-bold">เลขที่คำขอ</TableHead>
                <TableHead className="font-bold">ประเภท</TableHead>
                <TableHead className="font-bold">ครุภัณฑ์</TableHead>
                <TableHead className="font-bold">ผู้ยื่น</TableHead>
                <TableHead className="font-bold">สถานะ</TableHead>
                <TableHead className="font-bold text-right">วันที่ยื่น</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.requests || []).slice(0, 5).map((req: Any) => (
                <TableRow
                  key={req.id}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => {
                    const found = assets.find(a => a.id === req.assetId || a.code === req.code);
                    if (found) onOpenAsset(found);
                    else onOpenView('requests');
                  }}
                >
                  <TableCell className="font-mono text-xs font-bold text-blue-600">{req.requestNo}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        req.kind === 'transfer'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : req.kind === 'repair'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {requestTypes[(req.kind === 'dispose' ? 'disposal' : req.kind) as keyof typeof requestTypes] ??
                        req.kind}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-xs text-slate-900 line-clamp-1">{req.name || 'ครุภัณฑ์'}</div>
                    <div className="font-mono text-[11px] text-slate-600">{req.code || '—'}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">{req.requesterName || 'ไม่พบชื่อผู้ยื่น'}</TableCell>
                  <TableCell>
                    <Badge value={req.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-600 whitespace-nowrap">
                    {req.createdAt ? thaiDateTime(req.createdAt, false) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!data.requests.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-600">
                    ยังไม่มีคำขอ
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
