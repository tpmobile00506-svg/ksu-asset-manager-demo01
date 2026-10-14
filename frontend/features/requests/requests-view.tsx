'use client';

import { useState, useMemo } from 'react';
import {
  ListFilter,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Check,
  X,
  Eye,
  Search,
  ArrowRight,
  Package,
  Calendar,
  Building,
  UserCheck,
  MapPin,
  Filter,
  RotateCcw,
  Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Role, roles, money, awaitsApprovalBy } from '@/shared/domain';
import { buildApprovalDocumentHtml } from '@/shared/approval-document';
import { toast } from 'sonner';
import { Empty, Badge } from '@/frontend/components/common';
import type { WorkspaceData, RequestRecord } from '@/shared/models';

type TabKey = 'all' | 'pending' | 'transfer' | 'repair' | 'dispose';

function formatThaiDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = (d.getFullYear() + 543) % 100;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${mins}`;
  } catch {
    return isoStr;
  }
}

function formatReqCode(id: string, dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const yr = isNaN(d.getTime()) ? 69 : (d.getFullYear() + 543) % 100;
    const short = id.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `REQ-${yr}-${short}`;
  } catch {
    return `REQ-69-${id.slice(0, 4).toUpperCase()}`;
  }
}

function RequestKindBadge({ kind }: { kind: string }) {
  switch (kind) {
    case 'transfer':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          โอนย้ายสถานที่
        </span>
      );
    case 'repair':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          แจ้งส่งซ่อม
        </span>
      );
    case 'dispose':
    case 'disposal':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          ขอจำหน่ายครุภัณฑ์
        </span>
      );
    case 'borrow':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          ยืมใช้งานครุภัณฑ์
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
          {kind}
        </span>
      );
  }
}

function AssetConditionBadge({ condition }: { condition: string }) {
  switch (condition) {
    case 'damaged':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          ชำรุด
        </span>
      );
    case 'repair':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          รอส่งซ่อม
        </span>
      );
    case 'lost':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          สูญหาย
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          ปกติ
        </span>
      );
  }
}

function ApprovalPipeline({ request }: { request: RequestRecord }) {
  let chain: Role[] = ['head', 'deputy', 'dean'];
  try {
    chain = JSON.parse(request.chain);
  } catch {
    chain = ['head', 'deputy', 'dean'];
  }

  const roleLabels: Record<string, string> = {
    head: 'Head',
    deputy: 'Deputy',
    dean: 'Dean',
    staff: 'Staff',
    admin: 'Admin'
  };

  return (
    <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
      {chain.map((role, i) => {
        const isApproved = request.status === 'approved' || i < request.stage;
        const isCurrentPending = request.status === 'pending' && i === request.stage;
        const isRejectedAtThisStage = request.status === 'rejected' && i === request.stage;

        return (
          <div key={role + i} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                isApproved
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isCurrentPending
                  ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm'
                  : isRejectedAtThisStage
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              <span>{i + 1}. {roleLabels[role] || role}</span>
              {isApproved && <Check size={12} className="text-emerald-600 stroke-[3]" />}
              {isCurrentPending && <Clock size={11} className="text-amber-600" />}
              {isRejectedAtThisStage && <X size={12} className="text-rose-600 stroke-[3]" />}
            </span>
            {i < chain.length - 1 && (
              <span className="text-slate-300 text-xs font-bold">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RequestsView({
  data,
  open
}: {
  data: WorkspaceData;
  open: (k: string, a?: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [viewingRequest, setViewingRequest] = useState<RequestRecord | null>(null);

  // พิมพ์เอกสารอนุมัติของคำขอที่อนุมัติครบทุกขั้นแล้ว (เปิดหน้าต่างใหม่แล้วสั่งพิมพ์/บันทึกเป็น PDF)
  function printApprovalDocument(r: RequestRecord) {
    const asset = data.assets.find(a => a.id === r.assetId) ?? null;
    let payload: Record<string, unknown> = {};
    let chain: string[] = [];
    try { payload = JSON.parse(r.payload || '{}'); } catch { /* ใช้ค่าว่าง */ }
    try { chain = JSON.parse(r.chain || '[]'); } catch { /* ใช้ค่าว่าง */ }
    const html = buildApprovalDocumentHtml({
      requestCode: formatReqCode(r.id, r.createdAt),
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      payload,
      chain,
      asset: asset
        ? { code: asset.code, name: asset.name, quantity: asset.quantity, totalSatang: asset.totalSatang, location: asset.location, branch: asset.branch, custodian: asset.custodian }
        : null,
      approvals: data.approvals
        .filter(a => a.requestId === r.id)
        .map(a => ({ stage: a.stage, actorName: a.actorName || a.actor, decision: a.decision, note: a.note, createdAt: a.createdAt })),
    });
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerBranch, setPickerBranch] = useState<string>('all');

  const requests = data.requests || [];
  const assets = data.assets || [];

  // สถิติยอดรวมสำหรับ KPI Cards
  const total = requests.length;
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  const transferCount = requests.filter(r => r.kind === 'transfer').length;
  const repairCount = requests.filter(r => r.kind === 'repair').length;
  const disposeCount = requests.filter(r => r.kind === 'dispose' || r.kind === 'disposal').length;

  // สาขาวิชาที่มีครุภัณฑ์พร้อมยื่นคำขอ
  const pickerBranches = useMemo(() => {
    const set = new Set<string>();
    assets.forEach(a => {
      if (a.lifecycle === 'active' && a.branch) {
        set.add(a.branch.trim());
      }
    });
    return Array.from(set).sort();
  }, [assets]);

  // กรองรายการตามแท็บ
  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (tab === 'pending' && r.status !== 'pending') return false;
      if (tab === 'transfer' && r.kind !== 'transfer') return false;
      if (tab === 'repair' && r.kind !== 'repair') return false;
      if (tab === 'dispose' && r.kind !== 'dispose' && r.kind !== 'disposal') return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const asset = assets.find(a => a.id === r.assetId || a.code === r.code);
        const text = [r.id, r.code, r.name, r.reason, asset?.name, asset?.branch].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, search, assets]);

  // ครุภัณฑ์ที่สามารถยื่นคำขอได้
  const pickableAssets = useMemo(() => {
    return assets.filter(a => {
      if (a.lifecycle !== 'active') return false;
      if (pickerBranch !== 'all' && a.branch?.trim() !== pickerBranch) return false;
      if (pickerSearch) {
        const q = pickerSearch.toLowerCase().trim();
        const searchPool = [a.code, a.name, a.branch, a.location, a.category].filter(Boolean).join(' ').toLowerCase();
        return searchPool.includes(q);
      }
      return true;
    });
  }, [assets, pickerSearch, pickerBranch]);

  return (
    <>
      {/* 📊 การ์ดสรุปสถิติ 4 ใบ (KPI Summary Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* 1. ทั้งหมด */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ListFilter size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 block font-medium">คำขอทั้งหมดในระบบ</span>
            <b className="text-xl font-bold text-slate-900">{total} รายการ</b>
          </div>
        </div>

        {/* 2. รออนุมัติ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 block font-medium">อยู่ระหว่างการรออนุมัติ</span>
            <b className="text-xl font-bold text-amber-600">{pendingCount} รายการ</b>
          </div>
        </div>

        {/* 3. อนุมัติแล้ว */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 block font-medium">อนุมัติเสร็จสิ้นแล้ว</span>
            <b className="text-xl font-bold text-emerald-600">{approvedCount} รายการ</b>
          </div>
        </div>

        {/* 4. ส่งกลับ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-500 block font-medium">ส่งกลับ (ไม่อนุมัติ)</span>
            <b className="text-xl font-bold text-rose-600">{rejectedCount} รายการ</b>
          </div>
        </div>
      </div>

      {/* 🔘 แถบตัวกรองแท็บ (Filter Pills) + ปุ่มยื่นคำขอใหม่ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all' as TabKey, label: `ทั้งหมด (${total})` },
            { key: 'pending' as TabKey, label: `รออนุมัติ (${pendingCount})` },
            { key: 'transfer' as TabKey, label: `โอนย้าย (${transferCount})` },
            { key: 'repair' as TabKey, label: `ส่งซ่อม (${repairCount})` },
            { key: 'dispose' as TabKey, label: `จำหน่าย (${disposeCount})` }
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg gap-2 shadow-sm text-xs"
        >
          <Plus size={16} />
          ยื่นคำขอใหม่
        </Button>
      </div>

      {/* 📋 ตารางรายการคำขอสไตล์พรีเมียม (Requests Table) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-[140px] text-xs font-semibold text-slate-700">รหัสคำขอ / วันที่</TableHead>
                  <TableHead className="w-[150px] text-xs font-semibold text-slate-700">ประเภทคำขอ</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 min-w-[240px]">รายการครุภัณฑ์ที่เกี่ยวข้อง</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 min-w-[180px]">ผู้ยื่นคำขอ / สังกัด</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 min-w-[260px]">ความคืบหน้าสายอนุมัติ</TableHead>
                  <TableHead className="w-[140px] text-right text-xs font-semibold text-slate-700">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const asset = assets.find(a => a.id === r.assetId || a.code === r.code);
                  let payload: Record<string, any> = {};
                  try {
                    payload = JSON.parse(r.payload || '{}');
                  } catch {
                    payload = {};
                  }

                  const isApproverForThisStage = awaitsApprovalBy(r, data.me, asset?.branch);

                  return (
                    <TableRow key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* รหัสคำขอ / วันที่ */}
                      <TableCell className="align-top py-3.5">
                        <div
                          className="font-mono text-xs font-bold text-blue-600 tracking-tight select-all cursor-pointer"
                          title={r.id}
                        >
                          {formatReqCode(r.id, r.createdAt)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{formatThaiDateTime(r.createdAt)}</span>
                        </div>
                      </TableCell>

                      {/* ประเภทคำขอ */}
                      <TableCell className="align-top py-3.5">
                        <RequestKindBadge kind={r.kind} />
                      </TableCell>

                      {/* รายการครุภัณฑ์ที่เกี่ยวข้อง */}
                      <TableCell className="align-top py-3.5">
                        <div className="font-semibold text-slate-900 text-xs leading-snug line-clamp-2">
                          {r.name || asset?.name || 'ครุภัณฑ์ตามทะเบียน'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {payload.splitQuantity ? (
                            <span className="block text-indigo-600">เฉพาะ {payload.splitQuantity} ชิ้น (แบ่งล็อตเมื่ออนุมัติ)</span>
                          ) : null}
                          {r.kind === 'transfer' && payload.location && (
                            <span className="text-blue-600">
                              ย้ายไป: {payload.location} {payload.branch ? `(${payload.branch})` : ''}
                              {payload.custodian ? ` · ผู้รับผิดชอบใหม่: ${payload.custodian}` : ''}
                            </span>
                          )}
                          {r.kind === 'repair' && (
                            <span className="text-amber-600">
                              {payload.estimateSatang
                                ? `ประมาณการ: ฿${money(payload.estimateSatang)} บาท`
                                : r.reason || 'ส่งซ่อมบำรุง'}
                            </span>
                          )}
                          {(r.kind === 'dispose' || r.kind === 'disposal') && (
                            <span className="text-rose-600">{r.reason || 'ขออนุมัติตัดจำหน่าย'}</span>
                          )}
                          {r.kind === 'borrow' && (
                            <span className="text-emerald-600">{r.reason || 'ยืมใช้งานชั่วคราว'}</span>
                          )}
                        </div>
                      </TableCell>

                      {/* ผู้ยื่นคำขอ / สังกัด */}
                      <TableCell className="align-top py-3.5">
                        <div className="text-xs font-medium text-slate-800">
                          {r.actor === data.me.id ? data.me.name : 'เจ้าหน้าที่ผู้ยื่น'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Building size={11} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{asset?.branch || 'คณะวิศวกรรมศาสตร์'}</span>
                        </div>
                      </TableCell>

                      {/* ความคืบหน้าสายอนุมัติ 3 ระดับ */}
                      <TableCell className="align-top py-3.5">
                        <ApprovalPipeline request={r} />
                      </TableCell>

                      {/* จัดการ (Actions) */}
                      <TableCell className="align-top text-right py-3.5 whitespace-nowrap">
                        {isApproverForThisStage ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                              onClick={() => open('approve', { request: r })}
                            >
                              <Check size={12} className="mr-1" />
                              พิจารณา
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                              onClick={() => open('reject', { request: r })}
                              title="ส่งกลับคำขอ"
                            >
                              ส่งกลับ
                            </Button>
                          </div>
                        ) : r.status === 'approved' ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="badge approved">
                              อนุมัติแล้ว ✓
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                              onClick={() => setViewingRequest(r)}
                              title="ดูรายละเอียด"
                            >
                              <Eye size={13} />
                            </Button>
                          </div>
                        ) : r.status === 'rejected' ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="badge rejected">
                              ส่งกลับแล้ว ✗
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                              onClick={() => setViewingRequest(r)}
                              title="ดูรายละเอียด"
                            >
                              <Eye size={13} />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => setViewingRequest(r)}
                          >
                            <Eye size={13} className="mr-1" />
                            ดูรายละเอียด
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-12">
            <Empty
              title={tab === 'all' ? 'ยังไม่มีคำขอในระบบ' : 'ไม่พบคำขอในหมวดนี้'}
            >
              <p>สามารถกดยื่นคำขอโอนย้าย ส่งซ่อม หรือขอจำหน่ายได้ที่ปุ่ม "ยื่นคำขอใหม่"</p>
            </Empty>
          </div>
        )}
      </div>

      {/* 🔍 หน้าต่างเลือกครุภัณฑ์เพื่อยื่นคำขอใหม่ (Asset Picker Modal) */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl bg-white flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="p-6 pb-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
            <div className="flex items-center gap-3.5 pr-8">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-xs">
                <Package size={22} className="stroke-[1.8]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
                    เลือกครุภัณฑ์ที่ต้องการยื่นคำขอ
                  </DialogTitle>
                  <span className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                    พร้อมใช้งาน {pickableAssets.length} รายการ
                  </span>
                </div>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  เลือกรายการครุภัณฑ์จากทะเบียนเพื่อดำเนินการโอนย้ายสถานที่, ส่งซ่อม หรือขอตัดจำหน่าย
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Search Bar & Branch Filters */}
          <div className="px-6 py-3.5 bg-white border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="ค้นหาชื่อครุภัณฑ์, หมายเลขครุภัณฑ์ หรือสถานที่จัดเก็บ..."
                className="pl-10 pr-9 text-xs h-10 rounded-xl bg-slate-50/70 border-slate-200 focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              {pickerSearch && (
                <button
                  type="button"
                  onClick={() => setPickerSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/60 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Branch Filter Pills */}
            {pickerBranches.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] text-slate-400 font-medium shrink-0 flex items-center gap-1 mr-1">
                  <Filter size={12} /> สาขาวิชา:
                </span>
                <button
                  type="button"
                  onClick={() => setPickerBranch('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                    pickerBranch === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  ทั้งหมด ({assets.filter(a => a.lifecycle === 'active').length})
                </button>
                {pickerBranches.map(branch => {
                  const count = assets.filter(a => a.lifecycle === 'active' && a.branch?.trim() === branch).length;
                  return (
                    <button
                      type="button"
                      key={branch}
                      onClick={() => setPickerBranch(branch)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                        pickerBranch === branch
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                      }`}
                    >
                      {branch} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* List of Assets */}
          <div className="overflow-y-auto max-h-[380px] p-5 space-y-2.5 bg-slate-50/40">
            {pickableAssets.map(a => (
              <div
                key={a.id}
                onClick={() => {
                  setPickerOpen(false);
                  open('request', { asset: a });
                }}
                className="group relative p-3.5 bg-white hover:bg-blue-50/30 rounded-xl border border-slate-200/90 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Thumbnail / Category Icon */}
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden text-slate-500 group-hover:bg-blue-100/60 group-hover:text-blue-600 group-hover:border-blue-200 transition-colors">
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={22} className="stroke-[1.75]" />
                    )}
                  </div>

                  {/* Asset Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {a.name}
                      </span>
                      <AssetConditionBadge condition={a.condition} />
                      {a.category && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 text-slate-600 border border-slate-200/50">
                          {a.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono text-[11.5px] font-semibold text-slate-700 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200">
                        {a.code}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Building size={12} className="text-slate-400 shrink-0" />
                        <span>{a.branch}</span>
                      </span>
                      {a.location && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span>{a.location}</span>
                        </span>
                      )}
                      {a.unitSatang ? (
                        <span className="text-[11px] text-slate-400 font-mono">
                          มูลค่า {money(a.unitSatang)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Select Action Button */}
                <div className="shrink-0 flex items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs font-semibold text-blue-600 border-blue-200 bg-blue-50/40 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all rounded-lg flex items-center gap-1.5 shadow-none"
                  >
                    เลือก
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {pickableAssets.length === 0 && (
              <div className="py-12 px-4 text-center bg-white rounded-xl border border-dashed border-slate-200">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Search size={20} />
                </div>
                <p className="text-sm font-semibold text-slate-700">ไม่พบครุภัณฑ์ที่ตรงกับเงื่อนไข</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  ลองเปลี่ยนคำค้นหา หรือกดล้างตัวกรองเพื่อค้นหาจากรายการทั้งหมด
                </p>
                {(pickerSearch || pickerBranch !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPickerSearch('');
                      setPickerBranch('all');
                    }}
                    className="mt-3.5 h-8 text-xs text-blue-600 border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    <RotateCcw size={12} className="mr-1.5" />
                    ล้างการค้นหาและตัวกรอง
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={14} className="text-emerald-500" />
              แสดง <b className="text-slate-800">{pickableAssets.length}</b> จากทั้งหมด {assets.filter(a => a.lifecycle === 'active').length} รายการที่พร้อมยื่นคำขอ
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickerOpen(false)}
              className="h-8 text-xs text-slate-600 hover:text-slate-900 rounded-lg"
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 📄 หน้าต่างดูรายละเอียดและบันทึกการอนุมัติ (Request Details Modal) */}
      <Dialog open={!!viewingRequest} onOpenChange={open => !open && setViewingRequest(null)}>
        {viewingRequest && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <RequestKindBadge kind={viewingRequest.kind} />
                <span className="font-mono text-xs font-bold text-slate-500">
                  {formatReqCode(viewingRequest.id, viewingRequest.createdAt)}
                </span>
              </div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {viewingRequest.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-mono">
                หมายเลขครุภัณฑ์: {viewingRequest.code}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-2 text-xs">
              {(() => {
                let p: Record<string, any> = {};
                try {
                  p = JSON.parse(viewingRequest.payload || '{}');
                } catch {}

                return (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-slate-500 shrink-0">เหตุผลที่ระบุ:</span>
                      <span className="font-medium text-slate-800 text-right">{viewingRequest.reason || '—'}</span>
                    </div>

                    {viewingRequest.kind === 'transfer' && (p.location || p.branch) && (
                      <div className="flex justify-between items-start gap-2 pt-1.5 border-t border-slate-200/70">
                        <span className="text-slate-500 shrink-0">สถานที่ปลายทาง:</span>
                        <span className="font-semibold text-blue-700 text-right">
                          {p.location || '—'} {p.branch ? `(${p.branch})` : ''}
                        </span>
                      </div>
                    )}

                    {viewingRequest.kind === 'repair' && p.estimateSatang !== undefined && (
                      <div className="flex justify-between items-center gap-2 pt-1.5 border-t border-slate-200/70">
                        <span className="text-slate-500 shrink-0">ประมาณการค่าซ่อม:</span>
                        <span className="font-bold text-amber-700 text-right">
                          ฿{money(p.estimateSatang)} บาท
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/70">
                      <span className="text-slate-500">วันที่ยื่นคำขอ:</span>
                      <span className="font-medium text-slate-800">{formatThaiDateTime(viewingRequest.createdAt)}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <h4 className="font-semibold text-slate-800 mb-2">สายการอนุมัติ:</h4>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <ApprovalPipeline request={viewingRequest} />
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-2">บันทึกการลงนามและหมายเหตุ:</h4>
                {data.approvals.filter(a => a.requestId === viewingRequest.id).length > 0 ? (
                  <div className="space-y-2">
                    {data.approvals
                      .filter(a => a.requestId === viewingRequest.id)
                      .map(a => (
                        <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              <UserCheck size={12} className="text-blue-600" />
                              {a.actorName || a.actor}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                a.decision === 'approve' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {a.decision === 'approve' ? 'อนุมัติเรียบร้อย' : 'ส่งกลับแก้ไข'}
                            </span>
                          </div>
                          {a.note && <p className="text-slate-600 mt-1">{a.note}</p>}
                          <div className="text-[10px] text-slate-400 mt-1">{formatThaiDateTime(a.createdAt)}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">ยังไม่มีบันทึกการลงนาม อยู่ระหว่างรอการตรวจสอบ</p>
                )}
              </div>
            </div>
            {viewingRequest.status === 'approved' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs font-bold cursor-pointer"
                onClick={() => printApprovalDocument(viewingRequest)}
              >
                <Printer size={14} className="mr-1.5" /> พิมพ์เอกสารอนุมัติ
              </Button>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
