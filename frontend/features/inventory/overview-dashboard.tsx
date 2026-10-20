'use client';
import { Check, FileCheck2, Package, TriangleAlert } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { money, type Asset, type ConditionSummary } from '@/shared/domain';
import { Badge, type Any } from '@/frontend/components/common';
import type { WorkspaceData } from '@/frontend/types/models';
import OverviewCharts from './overview-charts';

// หน้าภาพรวม (Dashboard): การ์ดตัวเลข 4 ใบ → กราฟ → ตารางคำขอล่าสุด 5 รายการ
// ตัวเลขทุกตัวคำนวณจากข้อมูลที่โหลดมาแล้วในเครื่อง (ไม่เรียก API เพิ่ม)
export function OverviewDashboard({
  data,
  assets,
  active,
  total,
  pending,
  conditionCount,
  onSelectBranch,
  onOpenView,
  onOpenAsset,
}: {
  data: WorkspaceData;
  assets: Asset[];
  active: Asset[];
  total: number; // มูลค่ารวมของรายการที่ใช้งาน (สตางค์)
  pending: Any[];
  conditionCount: ConditionSummary;
  onSelectBranch: (branch: string) => void;
  onOpenView: (view: string) => void;
  onOpenAsset: (asset: Asset) => void;
}) {
  return (
    <>
      {/* 4 Dashboard Overview KPI Cards matching desktop_2_dashboard.svg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Package size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ครุภัณฑ์ทั้งหมดในระบบ</span>
            <strong className="text-xl font-bold text-slate-900 block leading-tight">
              {active.length.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] font-bold text-blue-600 block mt-0.5">มูลค่ารวม {money(total)} บาท</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Check size={22} className="stroke-[3]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">สภาพปกติพร้อมใช้งาน</span>
            <strong className="text-xl font-bold text-emerald-600 block leading-tight">
              {active.filter(a => a.condition === 'normal').length.toLocaleString('th-TH')} รายการ (
              {active.length
                ? ((active.filter(a => a.condition === 'normal').length / active.length) * 100).toFixed(1)
                : 0}
              %)
            </strong>
            <span className="text-[11px] text-emerald-700 block mt-0.5">ใช้งานในห้องปฏิบัติการและสำนักงาน</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <TriangleAlert size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ชำรุด / ส่งซ่อม</span>
            <strong className="text-xl font-bold text-rose-600 block leading-tight">
              {(conditionCount.damaged + conditionCount.repair).toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-rose-700 block mt-0.5">
              ชำรุด {conditionCount.damaged.toLocaleString('th-TH')} · กำลังซ่อม{' '}
              {conditionCount.repair.toLocaleString('th-TH')} · จำหน่ายแล้ว{' '}
              {conditionCount.disposed.toLocaleString('th-TH')}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <FileCheck2 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">คำขอรอการอนุมัติ</span>
            <strong className="text-xl font-bold text-amber-600 block leading-tight">{pending.length} รายการ</strong>
            <span className="text-[11px] text-amber-700 block mt-0.5">
              โอนย้าย {pending.filter((r: Any) => r.kind === 'transfer').length} · ซ่อม{' '}
              {pending.filter((r: Any) => r.kind === 'repair').length} · อื่นๆ{' '}
              {pending.filter((r: Any) => r.kind !== 'transfer' && r.kind !== 'repair').length}
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
            <h2 className="text-base font-bold text-slate-900">
              รายการความเคลื่อนไหวและคำขอล่าสุด (Recent Activities)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">คำขอโอนย้าย ซ่อมบำรุง และจำหน่ายล่าสุดในระบบ</p>
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
                <TableHead className="font-bold">รหัสคำขอ</TableHead>
                <TableHead className="font-bold">ประเภทคำขอ</TableHead>
                <TableHead className="font-bold">รายการครุภัณฑ์ / รหัส</TableHead>
                <TableHead className="font-bold">ผู้ยื่นคำขอ</TableHead>
                <TableHead className="font-bold">สถานะคำขอ</TableHead>
                <TableHead className="font-bold text-right">เวลาทำรายการ</TableHead>
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
                      {req.kind === 'transfer' ? 'โอนย้ายสถานที่' : req.kind === 'repair' ? 'แจ้งส่งซ่อม' : 'ขอจำหน่าย'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-xs text-slate-900 line-clamp-1">{req.name || 'ครุภัณฑ์'}</div>
                    <div className="font-mono text-[11px] text-slate-500">{req.code || '—'}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">{req.requesterName || 'ไม่พบชื่อผู้ยื่น'}</TableCell>
                  <TableCell>
                    <Badge value={req.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-500 whitespace-nowrap">
                    {req.createdAt ? new Date(req.createdAt).toLocaleDateString('th-TH') : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!data.requests.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-400">
                    ยังไม่มีคำขอล่าสุดในระบบ
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
