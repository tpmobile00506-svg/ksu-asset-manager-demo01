'use client';

import { useState, useMemo } from 'react';
import { Clock, Plus, Check, X, Eye, Search, ArrowRight, Package, Building, UserCheck, MapPin, Filter, RotateCcw, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Role, roles, requestTypes, awaitsApprovalBy, pendingForUser, thaiDateTime } from '@/shared/domain';
import { buildApprovalDocumentHtml } from '@/shared/approval-document';
import { toast } from 'sonner';
import { Empty, Badge, Pick, baht } from '@/frontend/components/common';
import type { WorkspaceData, RequestRecord } from '@/shared/models';

// หน้าคำขอ (โอนย้าย / ส่งซ่อม / จำหน่าย)
// - ตัวกรองแยก 2 แบบ: สถานะ (ปุ่มด้านบน) และประเภท (ช่องเลือก) · ผู้อนุมัติเริ่มที่แท็บ "รอฉันอนุมัติ"
// - จอกว้างเป็นตาราง จอมือถือ (ต่ำกว่า 768) เป็นการ์ดที่มีปุ่มอนุมัติอยู่ท้ายการ์ด ไม่ต้องเลื่อนตารางไปทางขวา
// - ผู้ยื่นยกเลิกคำขอของตัวเองได้ระหว่างรออนุมัติทุกขั้น (คำสั่ง cancelRequest)

type StatusTab = 'mine' | 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';
type KindFilter = 'all' | 'transfer' | 'repair' | 'disposal';
type Payload = Record<string, any>;

// คำขอเก่าบางรายการเก็บประเภทจำหน่ายเป็น 'dispose'
const kindOf = (r: { kind: string }) => (r.kind === 'dispose' ? 'disposal' : r.kind);
const readPayload = (r: RequestRecord): Payload => {
  try {
    return JSON.parse(r.payload || '{}');
  } catch {
    return {};
  }
};
const readChain = (r: RequestRecord): Role[] => {
  try {
    return JSON.parse(r.chain);
  } catch {
    return ['head', 'deputy', 'dean'];
  }
};

const kindStyles: Record<string, string> = {
  transfer: 'bg-blue-50 text-blue-700 border-blue-200',
  repair: 'bg-amber-50 text-amber-800 border-amber-200',
  disposal: 'bg-rose-50 text-rose-700 border-rose-200',
};
function KindBadge({ kind }: { kind: string }) {
  const k = kindOf({ kind });
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${kindStyles[k] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}
    >
      {requestTypes[k as keyof typeof requestTypes] ?? kind}
    </span>
  );
}

// แถบสายอนุมัติ: ชื่อบทบาทภาษาไทย ขั้นที่ผ่านแล้วสีเขียว ขั้นที่รอสีเหลือง ขั้นที่ไม่อนุมัติสีแดง
function ApprovalPipeline({ request, oneLine }: { request: RequestRecord; oneLine?: boolean }) {
  const chain = readChain(request);
  return (
    <div className={`flex items-center gap-1.5 ${oneLine ? 'flex-nowrap' : 'flex-wrap'}`}>
      {chain.map((role, i) => {
        const done = request.status === 'approved' || i < request.stage;
        const waiting = request.status === 'pending' && i === request.stage;
        const rejected = request.status === 'rejected' && i === request.stage;
        return (
          <div key={role + i} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
                done
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : waiting
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : rejected
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {roles[role] ?? role}
              {done && <Check size={12} className="text-emerald-600 stroke-[3]" />}
              {waiting && <Clock size={11} className="text-amber-700" />}
              {rejected && <X size={12} className="text-rose-600 stroke-[3]" />}
            </span>
            {i < chain.length - 1 && <span className="text-slate-400 text-xs font-bold">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// สิ่งที่คำขอจะทำ: ย้ายจากไหนไปไหน, ค่าซ่อมประมาณ, จำนวนที่ขอ
function RequestSummary({ r, payload }: { r: RequestRecord; payload: Payload }) {
  const k = kindOf(r);
  return (
    <div className="text-xs text-slate-600 mt-1 space-y-0.5">
      {payload.splitQuantity ? (
        <span className="block text-indigo-700">เฉพาะ {payload.splitQuantity} ชิ้น (แยกรายการเมื่ออนุมัติ)</span>
      ) : null}
      {k === 'transfer' && payload.location && (
        <span className="block text-blue-700">
          {payload.from?.location ? (
            <span className="block text-slate-600">
              จาก: {payload.from.location} {payload.from.branch ? `(${payload.from.branch})` : ''}
            </span>
          ) : null}
          ไป: {payload.location} {payload.branch ? `(${payload.branch})` : ''}
          {payload.custodian ? ` · ผู้รับผิดชอบใหม่: ${payload.custodian}` : ''}
        </span>
      )}
      {k === 'repair' && Number(payload.estimateSatang) > 0 && (
        <span className="block text-amber-800">ค่าซ่อมประมาณ {baht(Number(payload.estimateSatang))}</span>
      )}
      {r.reason && <span className="block text-slate-600 line-clamp-2">เหตุผล: {r.reason}</span>}
    </div>
  );
}

export default function RequestsView({
  data,
  open,
}: {
  data: WorkspaceData;
  open: (k: string, a?: Record<string, unknown>) => void;
}) {
  const requests = data.requests || [];
  const assets = data.assets || [];
  const approver = ['head', 'deputy', 'dean'].includes(data.me.role);
  const canCreate = ['staff', 'admin'].includes(data.me.role);
  const branchOf = (r: RequestRecord) => assets.find(a => a.id === r.assetId || a.code === r.code)?.branch;
  const waitingMe = useMemo(
    () => (approver ? pendingForUser(requests, data.me, assets) : []),
    [approver, requests, data.me, assets],
  );

  const [tab, setTab] = useState<StatusTab>(() => (waitingMe.length ? 'mine' : 'all'));
  const [kind, setKind] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [viewingRequest, setViewingRequest] = useState<RequestRecord | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerBranch, setPickerBranch] = useState<string>('all');

  // พิมพ์เอกสารอนุมัติของคำขอที่อนุมัติครบทุกขั้นแล้ว (เปิดหน้าต่างใหม่แล้วสั่งพิมพ์/บันทึกเป็น PDF)
  function printApprovalDocument(r: RequestRecord) {
    const asset = data.assets.find(a => a.id === r.assetId) ?? null;
    let chain: string[] = [];
    try {
      chain = JSON.parse(r.chain || '[]');
    } catch {
      /* ใช้ค่าว่าง */
    }
    const html = buildApprovalDocumentHtml({
      requestCode: r.requestNo,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      requesterName: r.requesterName || undefined,
      payload: readPayload(r),
      chain,
      asset: asset
        ? {
            code: asset.code,
            name: asset.name,
            quantity: asset.quantity,
            totalSatang: asset.totalSatang,
            location: asset.location,
            branch: asset.branch,
            custodian: asset.custodian,
          }
        : null,
      approvals: data.approvals
        .filter(a => a.requestId === r.id)
        .map(a => ({
          stage: a.stage,
          actorName: a.actorName || a.actor,
          decision: a.decision,
          note: a.note,
          createdAt: a.createdAt,
        })),
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

  const count = (status: string) => requests.filter(r => r.status === status).length;
  const statusTabs: { key: StatusTab; label: string; n: number }[] = [
    ...(approver ? [{ key: 'mine' as StatusTab, label: 'รอฉันอนุมัติ', n: waitingMe.length }] : []),
    { key: 'all', label: 'ทั้งหมด', n: requests.length },
    { key: 'pending', label: 'รออนุมัติ', n: count('pending') },
    { key: 'approved', label: 'อนุมัติแล้ว', n: count('approved') },
    { key: 'rejected', label: 'ไม่อนุมัติ', n: count('rejected') },
    ...(count('cancelled') ? [{ key: 'cancelled' as StatusTab, label: 'ยกเลิกแล้ว', n: count('cancelled') }] : []),
  ];

  const filtered = useMemo(() => {
    const mine = new Set(waitingMe.map(r => r.id));
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      if (tab === 'mine' && !mine.has(r.id)) return false;
      if (tab !== 'mine' && tab !== 'all' && r.status !== tab) return false;
      if (kind !== 'all' && kindOf(r) !== kind) return false;
      if (q) {
        const asset = assets.find(a => a.id === r.assetId || a.code === r.code);
        const text = [r.requestNo, r.code, r.name, r.reason, r.requesterName, asset?.name, asset?.branch]
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, kind, search, assets, waitingMe]);

  // สาขาที่มีครุภัณฑ์พร้อมยื่นคำขอ
  const activeAssets = useMemo(() => assets.filter(a => a.lifecycle === 'active'), [assets]);
  const pickerBranches = useMemo(
    () => Array.from(new Set(activeAssets.map(a => a.branch?.trim()).filter(Boolean) as string[])).sort(),
    [activeAssets],
  );
  const pickableAssets = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
    return activeAssets.filter(a => {
      if (pickerBranch !== 'all' && a.branch?.trim() !== pickerBranch) return false;
      if (q) return [a.code, a.name, a.branch, a.location, a.category].filter(Boolean).join(' ').toLowerCase().includes(q);
      return true;
    });
  }, [activeAssets, pickerSearch, pickerBranch]);

  // ปุ่มของแต่ละคำขอ: ผู้อนุมัติขั้นนี้ = อนุมัติ/ไม่อนุมัติ · ผู้ยื่นที่ยังรอ = ยกเลิกคำขอ
  const actionsFor = (r: RequestRecord) => ({
    decide: awaitsApprovalBy(r, data.me, branchOf(r)),
    cancel: r.status === 'pending' && r.actor === data.me.id,
  });
  const decideButtons = (r: RequestRecord, big?: boolean) => (
    <>
      <Button
        size="sm"
        className={`${big ? 'h-11 flex-1 text-sm' : 'h-8 px-3 text-xs'} font-semibold bg-blue-600 hover:bg-blue-700 text-white`}
        onClick={() => open('approve', { request: r })}
      >
        <Check size={14} className="mr-1" />
        อนุมัติ
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={`${big ? 'h-11 flex-1 text-sm' : 'h-8 px-3 text-xs'} font-semibold text-rose-700 hover:bg-rose-50 border-rose-300`}
        onClick={() => open('reject', { request: r })}
      >
        ไม่อนุมัติ
      </Button>
    </>
  );
  const cancelButton = (r: RequestRecord, big?: boolean) => (
    <Button
      variant="outline"
      size="sm"
      className={`${big ? 'h-11 flex-1 text-sm' : 'h-8 px-3 text-xs'} text-slate-700 border-slate-300`}
      onClick={() => open('cancelRequest', { request: r })}
    >
      ยกเลิกคำขอ
    </Button>
  );

  return (
    <>
      {/* ตัวกรอง: สถานะ (ปุ่ม) + ประเภท (ช่องเลือก) + ค้นหา · ปุ่มยื่นคำขอใหม่อยู่ขวาสุด */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="สถานะคำขอ">
          {statusTabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-9 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white font-semibold border border-blue-600'
                  : t.key === 'mine' && t.n > 0
                    ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label} ({t.n})
            </button>
          ))}
        </div>
        {canCreate && (
          <Button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 rounded-lg gap-2"
          >
            <Plus size={16} />
            ยื่นคำขอใหม่
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-[1_1_16rem] min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขที่คำขอ ชื่อ หรือหมายเลขครุภัณฑ์"
            className="pl-9 h-10 bg-white"
          />
        </div>
        <div className="w-full sm:w-48">
          <Pick
            label="ประเภทคำขอ"
            value={kind}
            onChange={v => setKind(v as KindFilter)}
            options={[
              ['all', 'ทุกประเภท'],
              ['transfer', requestTypes.transfer],
              ['repair', requestTypes.repair],
              ['disposal', requestTypes.disposal],
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12">
          <Empty title={requests.length ? 'ไม่มีคำขอตามตัวกรองนี้' : 'ยังไม่มีคำขอ'}>
            {tab === 'mine' ? (
              <p>ตอนนี้ไม่มีคำขอที่รอคุณอนุมัติ</p>
            ) : canCreate ? (
              <p>ยื่นโอนย้าย ส่งซ่อม หรือจำหน่ายได้ที่ปุ่ม “ยื่นคำขอใหม่”</p>
            ) : null}
          </Empty>
        </div>
      ) : (
        <>
          {/* จอมือถือ: การ์ด ปุ่มอยู่ท้ายการ์ด กดได้ด้วยนิ้วโป้ง */}
          <div className="md:hidden space-y-3">
            {filtered.map(r => {
              const payload = readPayload(r);
              const can = actionsFor(r);
              return (
                <article key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <KindBadge kind={r.kind} />
                    <Badge value={r.status} />
                  </div>
                  <h3 className="mt-2 font-semibold text-slate-900 text-[15px] leading-snug">
                    {r.name || 'ครุภัณฑ์ตามทะเบียน'}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono mt-0.5 break-all">
                    {r.requestNo} · {r.code}
                  </p>
                  <RequestSummary r={r} payload={payload} />
                  <p className="text-xs text-slate-600 mt-2">
                    {r.requesterName || 'ไม่พบชื่อผู้ยื่น'} · {thaiDateTime(r.createdAt)}
                  </p>
                  <div className="mt-2">
                    <ApprovalPipeline request={r} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {can.decide && decideButtons(r, true)}
                    {can.cancel && cancelButton(r, true)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-11 text-sm text-slate-700 ${can.decide || can.cancel ? 'px-3' : 'flex-1 border border-slate-200'}`}
                      onClick={() => setViewingRequest(r)}
                      aria-label="ดูรายละเอียด"
                    >
                      <Eye size={16} className={can.decide || can.cancel ? '' : 'mr-1.5'} />
                      {can.decide || can.cancel ? null : 'ดูรายละเอียด'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* จอกว้าง: ตาราง */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="w-[150px] text-xs font-semibold text-slate-700">เลขที่ / วันที่</TableHead>
                    <TableHead className="w-[96px] text-xs font-semibold text-slate-700">ประเภท</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700 min-w-[220px]">ครุภัณฑ์</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700 min-w-[160px]">ผู้ยื่น / สาขา</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700 min-w-[320px]">สายอนุมัติ</TableHead>
                    <TableHead className="w-[190px] text-right text-xs font-semibold text-slate-700">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const payload = readPayload(r);
                    const can = actionsFor(r);
                    return (
                      <TableRow key={r.id} className="hover:bg-slate-50/70">
                        <TableCell className="align-top py-3.5">
                          <div className="font-mono text-xs font-bold text-blue-700" title={r.id}>
                            {r.requestNo}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">{thaiDateTime(r.createdAt)}</div>
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          <KindBadge kind={r.kind} />
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          <div className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                            {r.name || 'ครุภัณฑ์ตามทะเบียน'}
                          </div>
                          <div className="font-mono text-xs text-slate-600">{r.code}</div>
                          <RequestSummary r={r} payload={payload} />
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          <div className="text-sm text-slate-800">{r.requesterName || 'ไม่พบชื่อผู้ยื่น'}</div>
                          <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                            <Building size={12} className="shrink-0" />
                            <span className="truncate max-w-[170px]">{branchOf(r) || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          <ApprovalPipeline request={r} oneLine />
                          {r.status !== 'pending' && (
                            <div className="mt-1.5">
                              <Badge value={r.status} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right py-3.5">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {can.decide && decideButtons(r)}
                            {can.cancel && cancelButton(r)}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-slate-700 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => setViewingRequest(r)}
                              title="ดูรายละเอียด"
                            >
                              <Eye size={14} className={can.decide || can.cancel ? '' : 'mr-1'} />
                              {can.decide || can.cancel ? null : 'ดูรายละเอียด'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* หน้าต่างเลือกครุภัณฑ์เพื่อยื่นคำขอใหม่ */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200 shadow-2xl bg-white flex flex-col max-h-[90dvh]">
          <div className="p-5 pb-4 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Package size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold text-slate-900">เลือกครุภัณฑ์ที่จะยื่นคำขอ</DialogTitle>
                <DialogDescription className="text-sm text-slate-600 mt-0.5">
                  โอนย้าย ส่งซ่อม หรือจำหน่าย · {pickableAssets.length.toLocaleString('th-TH')} รายการ
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="ค้นหาชื่อ หมายเลขครุภัณฑ์ หรือสถานที่"
                className="pl-9 pr-9 h-10 rounded-xl bg-slate-50/70"
              />
              {pickerSearch && (
                <button
                  type="button"
                  onClick={() => setPickerSearch('')}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200/60"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {pickerBranches.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-xs text-slate-600 font-medium shrink-0 flex items-center gap-1 mr-1">
                  <Filter size={12} /> สาขา:
                </span>
                {[['all', `ทั้งหมด (${activeAssets.length})`] as const, ...pickerBranches.map(b => [b, b] as const)].map(
                  ([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setPickerBranch(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ${
                        pickerBranch === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 p-4 space-y-2 bg-slate-50/40">
            {pickableAssets.map(a => (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  setPickerOpen(false);
                  open('request', { asset: a });
                }}
                className="group w-full text-left p-3 bg-white hover:bg-blue-50/40 rounded-xl border border-slate-200 hover:border-blue-400 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden text-slate-500">
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 line-clamp-1">{a.name}</span>
                      <Badge value={a.condition} />
                    </div>
                    <div className="flex items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-600 flex-wrap mt-0.5">
                      <span className="font-mono font-semibold text-slate-700 break-all">{a.code}</span>
                      <span className="inline-flex items-center gap-1">
                        <Building size={12} className="shrink-0" />
                        {a.branch}
                      </span>
                      {a.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="shrink-0" />
                          {a.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                  เลือก
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
            {pickableAssets.length === 0 && (
              <div className="py-10 px-4 text-center bg-white rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-semibold text-slate-700">ไม่พบครุภัณฑ์ที่ตรงกับที่ค้นหา</p>
                {(pickerSearch || pickerBranch !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPickerSearch('');
                      setPickerBranch('all');
                    }}
                    className="mt-3 h-9 text-sm text-blue-700 border-blue-200"
                  >
                    <RotateCcw size={13} className="mr-1.5" />
                    ล้างการค้นหา
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              ปิด
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* หน้าต่างรายละเอียดคำขอ: ผลการพิจารณาแต่ละขั้น และปุ่มที่ผู้ใช้คนนี้กดได้ */}
      <Dialog open={!!viewingRequest} onOpenChange={o => !o && setViewingRequest(null)}>
        {viewingRequest && (
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <KindBadge kind={viewingRequest.kind} />
                <Badge value={viewingRequest.status} />
                <span className="font-mono text-xs font-bold text-slate-600">{viewingRequest.requestNo}</span>
              </div>
              <DialogTitle className="text-base font-bold text-slate-900">{viewingRequest.name}</DialogTitle>
              <DialogDescription className="text-xs text-slate-600 font-mono break-all">
                หมายเลขครุภัณฑ์: {viewingRequest.code}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-2 text-sm">
              {(() => {
                const p = readPayload(viewingRequest);
                const row = (label: string, value: React.ReactNode, cls = 'text-slate-800') => (
                  <div className="flex justify-between items-start gap-3 pt-1.5 border-t border-slate-200/70 first:border-0 first:pt-0">
                    <span className="text-slate-600 shrink-0">{label}</span>
                    <span className={`font-medium text-right ${cls}`}>{value}</span>
                  </div>
                );
                return (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                    {row('เหตุผล', viewingRequest.reason || '—')}
                    {kindOf(viewingRequest) === 'transfer' &&
                      p.from?.location &&
                      row('จาก', `${p.from.location} ${p.from.branch ? `(${p.from.branch})` : ''}`)}
                    {kindOf(viewingRequest) === 'transfer' &&
                      (p.location || p.branch) &&
                      row('ไป', `${p.location || '—'} ${p.branch ? `(${p.branch})` : ''}`, 'text-blue-800')}
                    {kindOf(viewingRequest) === 'repair' &&
                      p.estimateSatang !== undefined &&
                      row('ค่าซ่อมประมาณ', baht(Number(p.estimateSatang) || 0), 'text-amber-800')}
                    {row('ผู้ยื่น', viewingRequest.requesterName || '—')}
                    {row('วันที่ยื่น', thaiDateTime(viewingRequest.createdAt))}
                  </div>
                );
              })()}

              <div>
                <h4 className="font-semibold text-slate-800 mb-2">สายอนุมัติ</h4>
                <ApprovalPipeline request={viewingRequest} />
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-2">ผลการพิจารณาแต่ละขั้น</h4>
                {data.approvals.filter(a => a.requestId === viewingRequest.id).length > 0 ? (
                  <div className="space-y-2">
                    {data.approvals
                      .filter(a => a.requestId === viewingRequest.id)
                      .map(a => (
                        <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              <UserCheck size={13} className="text-blue-600" />
                              {a.actorName || a.actor}
                            </span>
                            <span
                              className={`text-xs font-bold ${a.decision === 'approve' ? 'text-emerald-700' : 'text-rose-700'}`}
                            >
                              {a.decision === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ'}
                            </span>
                          </div>
                          {a.note && <p className="text-slate-700 mt-1">{a.note}</p>}
                          <div className="text-xs text-slate-600 mt-1">{thaiDateTime(a.createdAt)}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-600">ยังไม่มีผู้พิจารณา</p>
                )}
                {viewingRequest.status === 'cancelled' && (
                  <p className="mt-2 text-slate-600">ผู้ยื่นยกเลิกคำขอนี้แล้ว ทะเบียนไม่เปลี่ยน</p>
                )}
              </div>
            </div>
            {(() => {
              const can = actionsFor(viewingRequest);
              const r = viewingRequest;
              return (
                <div className="flex flex-col sm:flex-row gap-2">
                  {can.decide && (
                    <div className="flex gap-2 flex-1" onClick={() => setViewingRequest(null)}>
                      {decideButtons(r, true)}
                    </div>
                  )}
                  {can.cancel && (
                    <div className="flex flex-1" onClick={() => setViewingRequest(null)}>
                      {cancelButton(r, true)}
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => printApprovalDocument(r)}>
                      <Printer size={15} className="mr-1.5" /> พิมพ์เอกสารอนุมัติ
                    </Button>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
