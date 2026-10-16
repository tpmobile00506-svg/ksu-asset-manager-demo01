'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Asset,
  Role,
  roles,
  conditions,
  requestTypes,
  money,
  satang,
  splitAmounts,
  standardBranches,
  fiscalYearOf
} from '@/shared/domain';
import { Any, Pick, statusLabel } from '@/frontend/components/common';
import type { WorkspaceData } from '@/shared/models';
import QrLabelModal from './qr-label-modal';
import AssetFormModal, {
  Field,
  BranchSelect,
  assetAmountInput,
  assetTotalInput,
  uploadCreatedAssetPhoto,
  deleteAssetPhoto
} from './asset-form-modal';

// Re-export utility functions so tests and other components maintain backward compatibility
export {
  Field,
  assetAmountInput,
  assetTotalInput,
  uploadCreatedAssetPhoto,
  deleteAssetPhoto
};

const prioritized = (object: Any, key: string) =>
  Object.entries(object).sort(([a], [b]) =>
    a === key ? -1 : b === key ? 1 : 0
  ) as [string, string][];

const titleMap: Record<string, string> = {
  create: 'เพิ่มครุภัณฑ์ใหม่',
  edit: 'แก้ไขข้อมูลครุภัณฑ์',
  import: 'ตรวจสอบและยืนยันนำเข้า',
  split: 'แบ่งล็อตครุภัณฑ์',
  request: 'สร้างคำขอ',
  approve: 'อนุมัติคำขอ',
  reject: 'ส่งคำขอกลับ',
  round: 'เปิดรอบตรวจนับ',
  check: 'บันทึกผลตรวจนับ',
  user: 'กำหนดสิทธิ์ผู้ใช้',
  source: 'ข้อมูลต้นฉบับ',
  qr: 'ป้าย QR ประจำครุภัณฑ์',
  repairComplete: 'บันทึกผลการซ่อม'
};

export default function Editor({
  data,
  selected,
  setSelected,
  modal: currentModal,
  setModal,
  open,
  write,
  busy,
  error,
  setError,
  onPhotoChanged,
  historyRevision
}: {
  data: WorkspaceData;
  selected: Asset | null;
  setSelected: (a: Asset | null) => void;
  modal: Any | null;
  setModal: (m: Any | null) => void;
  open: (k: string, a?: Any) => void;
  write: (b: Any) => Promise<any>;
  busy: boolean;
  error: string;
  setError: (s: string) => void;
  onPhotoChanged: () => Promise<void>;
  historyRevision: number;
}) {
  // ระหว่างแอนิเมชันปิดหน้าต่าง ยังแสดงเนื้อหาเดิมไว้ (ไม่งั้นเห็นกรอบว่าง "หน้าต่างรายการ" แวบหนึ่ง)
  // การเปิด/ปิดหน้าต่างใช้ currentModal ส่วนเนื้อหาใช้ modal
  const lastModal = useRef<Any | null>(null);
  if (currentModal) lastModal.current = currentModal;
  const modal = currentModal ?? lastModal.current;
  const [take, setTake] = useState(1);
  const [splitOption, setSplitOption] = useState<'all' | 'partial'>('all');
  const [requestSplitTake, setRequestSplitTake] = useState(1);
  const [requestKind, setRequestKind] = useState<string>('transfer');
  const user = modal?.user;
  const creatingUser = !user?.id || !!user.invited;

  const editable = ['staff', 'admin'].includes(data.me.role);
  const active: Asset[] = data.assets.filter((a: Asset) => a.lifecycle === 'active');

  useEffect(() => {
    if (modal?.kind === 'split') {
      setTake(1);
    }
    if (modal?.kind === 'request') {
      setSplitOption('all');
      setRequestSplitTake(1);
      setRequestKind('transfer');
    }
  }, [modal?.token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());

    try {
      if (modal.kind === 'split') {
        await write({
          action: 'split',
          id: modal.asset.id,
          version: modal.asset.version,
          quantity: take,
          condition: f.condition,
          reason: f.reason
        });
      } else if (modal.kind === 'request') {
        const chosenKind = (f.requestKind as string) || requestKind || 'transfer';
        const isPartial = splitOption === 'partial' && modal.asset.quantity > 1;
        if (isPartial) {
          if (!Number.isInteger(requestSplitTake) || requestSplitTake < 1 || requestSplitTake >= modal.asset.quantity) {
            setError(`จำนวนที่แบ่งต้องเป็นจำนวนเต็มระหว่าง 1 ถึง ${modal.asset.quantity - 1}`);
            return;
          }
        }
        await write({
          action: 'request',
          id: modal.asset.id,
          version: modal.asset.version,
          kind: chosenKind,
          splitQuantity: isPartial ? requestSplitTake : undefined,
          payload: {
            location: f.location || '',
            branch: f.branch || '',
            custodian: f.custodian || '',
            estimateSatang: satang(f.cost || 0)
          },
          reason: f.reason
        });
      } else if (['approve', 'reject'].includes(modal.kind)) {
        await write({
          action: modal.kind,
          id: modal.request.id,
          version: modal.request.version,
          reason: f.reason
        });
      } else if (modal.kind === 'round') {
        await write({
          action: 'round',
          name: f.name,
          year: Number(f.year)
        });
      } else if (modal.kind === 'check') {
        await write({
          action: 'check',
          id: modal.item.id,
          expectedCheckedAt: modal.item.checkedAt ?? null,
          result: f.result,
          quantity: Number(f.quantity),
          reason: f.reason
        });
      } else if (modal.kind === 'user') {
        await write({
          action: 'user',
          name: f.name,
          email: f.email,
          role: f.role,
          ...(f.branch ? { branch: f.branch } : (user?.branch ? { branch: null } : {})),
          active: f.active === 'on',
          ...(f.password ? { password: f.password } : {})
        });
      } else if (modal.kind === 'repairComplete') {
        await write({
          action: 'repairComplete',
          id: modal.asset.id,
          version: modal.asset.version,
          costSatang: satang(f.cost),
          repairedBy: f.repairedBy,
          reason: f.reason
        });
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      {/* 1. หน้าต่างพิมพ์ป้าย QR Code */}
      <QrLabelModal
        open={currentModal?.kind === 'qr'}
        onClose={() => setModal(null)}
        assets={modal?.assets || []}
      />

      {/* 3. หน้าต่างเพิ่ม/แก้ไข/นำเข้าข้อมูลครุภัณฑ์ */}
      <AssetFormModal
        open={!!currentModal && ['create', 'edit', 'import'].includes(currentModal.kind)}
        onClose={() => setModal(null)}
        modal={modal}
        data={data}
        write={write}
        busy={busy}
        setSelected={setSelected}
        onPhotoChanged={onPhotoChanged}
        error={error}
        setError={setError}
      />

      {/* 4. หน้าต่างการดำเนินงานอื่นๆ (แบ่งล็อต, คำขอ, ตรวจนับ, ผู้ใช้, ซ่อมเสร็จ, ข้อมูลต้นฉบับ) */}
      <Dialog
        open={
          !!currentModal && !['create', 'edit', 'import', 'qr'].includes(currentModal.kind)
        }
        onOpenChange={v => {
          if (!v && !busy) {
            setModal(null);
          }
        }}
      >
        <DialogContent className="dialog-wide" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="dialog-header-sticky">
            <DialogTitle>{titleMap[modal?.kind || ''] || 'หน้าต่างรายการ'}</DialogTitle>
            <DialogDescription>
              {modal?.asset?.name ||
                modal?.request?.name ||
                modal?.item?.name ||
                'ระบบบันทึกชื่อผู้ดำเนินการและเวลาที่ทำรายการเสมอ'}
            </DialogDescription>
          </DialogHeader>

          {error && <div className="error mx-7 mt-3" role="alert">{error}</div>}

          {modal?.kind === 'source' ? (
            <div className="dialog-scroll-body">
              {modal.row.values.map(
                (v: unknown, i: number) =>
                  v !== null &&
                  v !== undefined && (
                    <div className="raw-cell" key={i}>
                      <code>
                        {String.fromCharCode(65 + i)}
                        {modal.row.row}
                      </code>
                      <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  )
              )}
              <div className="notice">
                ชีต {modal.row.sheet} · แถว {modal.row.row} · ข้อความต้นฉบับยังอยู่ครบ
                {modal.row.groupName && (
                  <p className="mt-2">เสนอเก็บเป็นหมวด: {modal.row.groupName}</p>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} key={modal?.token} className="flex flex-col flex-1 min-h-0">
              <div className="dialog-scroll-body">
                {modal?.kind === 'split' && (
                  <>
                    <div className="notice">
                      จำนวนเดิม {modal.asset.quantity} ชิ้น · มูลค่า{' '}
                      {money(modal.asset.totalSatang)} บาท · รายการเดิมคงอยู่ในประวัติ
                    </div>
                    <div className="form-grid">
                      <label>
                        จำนวนที่ต้องการแยก *
                        <Input
                          type="number"
                          min={1}
                          max={modal.asset.quantity - 1}
                          value={take}
                          onChange={e => setTake(Number(e.target.value))}
                          required
                        />
                      </label>
                      <label>
                        สถานะของส่วนที่แยก
                        <Pick
                          name="condition"
                          label="สถานะส่วนที่แยก"
                          options={prioritized(conditions, 'damaged')}
                        />
                      </label>
                    </div>
                    <div className="split-preview">
                      <div>
                        <p>ส่วนที่แยก</p>
                        <b>{take || 0} ชิ้น</b>
                        <p>
                          {Number.isInteger(take) &&
                          take > 0 &&
                          take < modal.asset.quantity
                            ? money(
                                splitAmounts(
                                  modal.asset.quantity,
                                  modal.asset.totalSatang,
                                  take
                                )[0]
                              )
                            : '—'}{' '}
                          บาท
                        </p>
                      </div>
                      <div>
                        <p>ส่วนที่เหลือ · {statusLabel(modal.asset.condition)}</p>
                        <b>{Math.max(0, modal.asset.quantity - take)} ชิ้น</b>
                        <p>
                          {Number.isInteger(take) &&
                          take > 0 &&
                          take < modal.asset.quantity
                            ? money(
                                splitAmounts(
                                  modal.asset.quantity,
                                  modal.asset.totalSatang,
                                  take
                                )[1]
                              )
                            : '—'}{' '}
                          บาท
                        </p>
                      </div>
                    </div>
                    <label className="mt-4 block">
                      <span>เหตุผลการแบ่งล็อต *</span>
                      <Textarea
                        name="reason"
                        required
                        placeholder="เช่น ชำรุดบางส่วน หรือแยกตามห้องใช้งานจริง"
                        rows={2}
                      />
                    </label>
                  </>
                )}

                {modal?.kind === 'request' && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 truncate">{modal.asset.name}</span>
                        <span className="font-mono text-slate-500 shrink-0">{modal.asset.code}</span>
                      </div>
                      <div className="text-slate-500">
                        จำนวนทั้งหมด <b>{modal.asset.quantity}</b> ชิ้น · สังกัด {modal.asset.branch} {modal.asset.location ? `(${modal.asset.location})` : ''} · มูลค่ารวม {money(modal.asset.totalSatang)} บาท
                      </div>
                    </div>

                    <Pick
                      name="requestKind"
                      label="ประเภทคำขอ"
                      value={requestKind}
                      onChange={setRequestKind}
                      options={[
                        ['transfer', 'โอนย้ายสถานที่ / สาขา'],
                        ['repair', 'ส่งซ่อมบำรุง'],
                        ['disposal', 'จำหน่าย / ตัดบัญชี']
                      ]}
                    />

                    {modal.asset.quantity > 1 && (
                      <div className="rounded-xl border border-blue-200/90 bg-blue-50/60 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Scissors size={14} className="text-blue-600" />
                            ขอบเขตจำนวนที่ต้องการยื่นคำขอ
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            (มีทั้งหมด {modal.asset.quantity} ชิ้น)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${splitOption === 'all' ? 'bg-white border-blue-500 shadow-xs font-semibold text-blue-900 ring-1 ring-blue-500/20' : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'}`}>
                            <input
                              type="radio"
                              name="splitChoice"
                              value="all"
                              checked={splitOption === 'all'}
                              onChange={() => setSplitOption('all')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div>ยื่นคำขอทั้งชุด</div>
                              <div className="text-[11px] text-slate-500 font-normal">ทั้งหมด {modal.asset.quantity} ชิ้น</div>
                            </div>
                          </label>

                          <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${splitOption === 'partial' ? 'bg-white border-blue-500 shadow-xs font-semibold text-blue-900 ring-1 ring-blue-500/20' : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'}`}>
                            <input
                              type="radio"
                              name="splitChoice"
                              value="partial"
                              checked={splitOption === 'partial'}
                              onChange={() => setSplitOption('partial')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div>ยื่นคำขอบางส่วน</div>
                              <div className="text-[11px] text-slate-500 font-normal">ระบุจำนวน (ระบบแบ่งล็อตเมื่ออนุมัติ)</div>
                            </div>
                          </label>
                        </div>

                        {splitOption === 'partial' && (
                          <div className="pt-2.5 border-t border-blue-100 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                ระบุจำนวนที่ต้องการยื่นคำขอ:
                              </label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={modal.asset.quantity - 1}
                                  value={requestSplitTake}
                                  onChange={e => {
                                    const val = parseInt(e.target.value, 10);
                                    setRequestSplitTake(isNaN(val) ? 1 : val);
                                  }}
                                  className="w-24 h-8 text-xs font-bold text-center bg-white"
                                  required
                                />
                                <span className="text-xs text-slate-600">
                                  ชิ้น (สูงสุด {modal.asset.quantity - 1} ชิ้น)
                                </span>
                              </div>
                            </div>

                            <div className="split-preview !my-1">
                              <div>
                                <p className="text-blue-700 font-medium">ส่วนที่ยื่นคำขอ ({requestTypes[requestKind as keyof typeof requestTypes] || 'คำขอ'})</p>
                                <b>{requestSplitTake || 0} ชิ้น</b>
                                <p className="text-slate-500 text-xs mt-0.5">
                                  {Number.isInteger(requestSplitTake) &&
                                  requestSplitTake > 0 &&
                                  requestSplitTake < modal.asset.quantity
                                    ? money(
                                        splitAmounts(
                                          modal.asset.quantity,
                                          modal.asset.totalSatang,
                                          requestSplitTake
                                        )[0]
                                      )
                                    : '—'}{' '}
                                  บาท
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600 font-medium">ส่วนที่คงเหลือในทะเบียน</p>
                                <b>{Math.max(0, modal.asset.quantity - requestSplitTake)} ชิ้น</b>
                                <p className="text-slate-500 text-xs mt-0.5">
                                  {Number.isInteger(requestSplitTake) &&
                                  requestSplitTake > 0 &&
                                  requestSplitTake < modal.asset.quantity
                                    ? money(
                                        splitAmounts(
                                          modal.asset.quantity,
                                          modal.asset.totalSatang,
                                          requestSplitTake
                                        )[1]
                                      )
                                    : '—'}{' '}
                                  บาท
                                </p>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              💡 คำขอนี้ระบุเฉพาะ {requestSplitTake} ชิ้น ระบบจะแบ่งล็อตให้เมื่ออนุมัติขั้นสุดท้าย (ระหว่างรอ รายการเดิมยังไม่เปลี่ยน และถ้าถูกส่งกลับจะไม่มีการแบ่ง) ส่วนที่เหลืออีก {modal.asset.quantity - requestSplitTake} ชิ้นใช้งานตามปกติ
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {requestKind === 'transfer' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                          label="สถานที่ใหม่ (ปลายทาง)"
                          name="location"
                          defaultValue={modal.asset.location}
                          required
                        />
                        <label>
                          <span>สาขาใหม่ (ปลายทาง) *</span>
                          <BranchSelect name="branch" defaultValue={modal.asset.branch} />
                        </label>
                        <Field
                          label="ผู้รับผิดชอบใหม่ (ถ้ามี)"
                          name="custodian"
                          placeholder={modal.asset.custodian ? `ปัจจุบัน: ${modal.asset.custodian}` : 'เว้นว่างถ้าไม่เปลี่ยน'}
                        />
                      </div>
                    )}

                    {requestKind === 'repair' && (
                      <Field
                        label="ประมาณการค่าซ่อม (บาท)"
                        name="cost"
                        placeholder="0.00"
                      />
                    )}

                    {requestKind === 'disposal' && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg p-2.5">
                        ⚠️ เมื่อคำขอจำหน่ายได้รับการอนุมัติครบทุกระดับ ครุภัณฑ์ส่วนนี้จะถูกตัดยอดออกจากทะเบียนใช้งาน (เปลี่ยนสถานะเป็นจำหน่ายแล้ว)
                      </div>
                    )}

                    <label>
                      <span>เหตุผลและความจำเป็น *</span>
                      <Textarea
                        name="reason"
                        required
                        placeholder="ระบุเหตุผลเพื่อประกอบการพิจารณาของสายอนุมัติ (เช่น ชำรุดใช้งานไม่ได้, โอนย้ายเพื่อการเรียนการสอน)"
                        rows={3}
                      />
                    </label>
                  </div>
                )}

                {modal && ['approve', 'reject'].includes(modal.kind) && (
                  <div className="flex flex-col gap-4">
                    <div className="notice">
                      {requestTypes[modal.request.kind as keyof typeof requestTypes]} ·{' '}
                      {modal.request.name}
                      <p className="mono">{modal.request.code}</p>
                      <p className="mt-1">เหตุผลของผู้ขอ: {modal.request.reason}</p>
                      {/* สิ่งที่จะเกิดขึ้นเมื่ออนุมัติ: ผู้อนุมัติต้องเห็นปลายทาง/จำนวนก่อนตัดสินใจ */}
                      {(() => {
                        let p: Record<string, any> = {};
                        try { p = JSON.parse(modal.request.payload || '{}'); } catch { /* ไม่มีรายละเอียด */ }
                        return (
                          <>
                            {modal.request.kind === 'transfer' && (
                              <p className="mt-1">ย้ายไป: <b>{p.location || '—'}</b> · {p.branch || '—'}{p.custodian ? ` · ผู้รับผิดชอบใหม่: ${p.custodian}` : ''}</p>
                            )}
                            {modal.request.kind === 'repair' && (
                              <p className="mt-1">ประมาณการค่าซ่อม: <b>฿{money(Number(p.estimateSatang) || 0)}</b></p>
                            )}
                            {p.splitQuantity ? (
                              <p className="mt-1">จำนวน: <b>เฉพาะ {p.splitQuantity} ชิ้น</b> (ระบบแบ่งล็อตเมื่ออนุมัติขั้นสุดท้าย)</p>
                            ) : p.setId ? (
                              <p className="mt-1">จำนวน: <b>ทั้งชุด {p.setCount ?? ''} รายการ</b> (ชุดห้ามแยก)</p>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    <label>
                      <span>
                        หมายเหตุการ{modal.kind === 'approve' ? 'อนุมัติ' : 'ส่งกลับ'}
                        {modal.kind === 'reject' && <span className="text-rose-600 font-bold ml-1">*</span>}
                      </span>
                      <Textarea
                        name="reason"
                        required={modal.kind === 'reject'}
                        placeholder={
                          modal.kind === 'reject'
                            ? 'ระบุเหตุผลในการส่งกลับคำขอ (จำเป็น เพื่อให้ผู้ยื่นแก้ไข)'
                            : 'ระบุความเห็นหรือข้อเสนอแนะเพิ่มเติม (ถ้ามี)'
                        }
                        rows={3}
                      />
                    </label>
                  </div>
                )}

                {modal?.kind === 'round' && (
                  <div className="form-grid">
                    <Field
                      label="ชื่อรอบตรวจนับ"
                      name="name"
                      placeholder="เช่น ตรวจนับประจำปีงบประมาณ 2568"
                      autoComplete="off"
                      required
                    />
                    <Field
                      label="ปีงบประมาณ (พ.ศ.)"
                      name="year"
                      type="number"
                      defaultValue={fiscalYearOf(new Date())}
                      required
                    />
                  </div>
                )}

                {modal?.kind === 'check' && (
                  <div className="flex flex-col gap-4">
                    <div className="notice p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs">
                      <b className="text-slate-900 text-sm block">{modal.item.name}</b>
                      <p className="mono font-mono text-blue-700 font-bold mt-0.5">{modal.item.code}</p>
                      <p className="mt-1 text-slate-600">
                        จำนวนตามทะเบียน ณ วันเปิดรอบ:{' '}
                        <strong className="text-slate-900">{JSON.parse(modal.item.snapshot).quantity}</strong> ชิ้น
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Pick
                        name="result"
                        label="ผลการตรวจนับ"
                        defaultValue={
                          modal.item.result && modal.item.result !== 'pending'
                            ? (modal.item.result === 'matched' ? 'normal' : modal.item.result)
                            : 'normal'
                        }
                        options={[
                          ['normal', 'ตรงตามทะเบียน'],
                          ['damaged', 'พบแต่ชำรุด'],
                          ['missing', 'ไม่พบ'],
                          ['mismatch', 'จำนวน/ข้อมูลไม่ตรง']
                        ]}
                      />
                      <Field
                        label="จำนวนที่พบจริง (ชิ้น)"
                        name="quantity"
                        type="number"
                        min={0}
                        defaultValue={
                          modal.item.quantity ?? JSON.parse(modal.item.snapshot).quantity
                        }
                        required
                      />
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-slate-700 font-medium">
                      <span>หมายเหตุผลตรวจนับ</span>
                      <Textarea
                        name="reason"
                        placeholder="เช่น ชำรุดจอแตก หรือ อยู่ระหว่างยืมใช้งาน"
                        defaultValue={modal.item.reason ?? ''}
                        rows={2}
                        className="text-xs"
                      />
                    </label>
                  </div>
                )}

                {modal?.kind === 'user' && (
                  <div className="flex flex-col gap-4">
                    <Field
                      label="ชื่อ-นามสกุล"
                      name="name"
                      defaultValue={user?.name ?? ''}
                      required
                    />
                    <Field
                      label="อีเมล"
                      name="email"
                      type="email"
                      defaultValue={user?.email ?? ''}
                      readOnly={!creatingUser}
                      required
                    />
                    <Pick
                      name="role"
                      label="บทบาท / สิทธิ์การใช้งาน"
                      defaultValue={user?.role ?? 'staff'}
                      options={Object.entries(roles).map(([r, label]) => [r, label])}
                    />
                    <Pick
                      name="branch"
                      label="สาขาวิชา / หน่วยงานที่สังกัด"
                      defaultValue={user?.branch ?? ''}
                      options={[
                        ['', '— ไม่ระบุ / ส่วนกลาง —'],
                        ...standardBranches.map(b => [b, b] as [string, string])
                      ]}
                    />
                    <Field
                      label={
                        creatingUser
                          ? 'รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)'
                          : 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)'
                      }
                      name="password"
                      type="password"
                      required={creatingUser}
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      hint="รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร"
                    />
                    <label className="flex! items-center gap-3">
                      <Checkbox
                        name="active"
                        defaultChecked={Boolean(user?.active ?? true)}
                      />
                      <span>เปิดใช้งานบัญชีนี้</span>
                    </label>
                  </div>
                )}

                {modal?.kind === 'repairComplete' && (
                  <div className="flex flex-col gap-4">
                    <div className="notice">
                      <b>{modal.asset.name}</b>
                      <p className="mono">{modal.asset.code}</p>
                      <p className="mt-1">
                        สถานะปัจจุบัน: กำลังซ่อม · เมื่อบันทึกจะเปลี่ยนสถานะเป็น "ปกติ"
                      </p>
                    </div>
                    <Field
                      label="ผู้ซ่อม / ร้านที่ซ่อม"
                      name="repairedBy"
                      placeholder="เช่น ช่างภายในคณะ หรือ ร้านเอ บี เซอร์วิส"
                      required
                    />
                    <Field
                      label="ค่าซ่อมจริง (บาท)"
                      name="cost"
                      placeholder="0.00"
                      required
                    />
                    <label>
                      <span>รายละเอียดการซ่อม / หมายเหตุ *</span>
                      <Textarea
                        required
                        name="reason"
                        placeholder="เช่น เปลี่ยนอะไหล่เมนบอร์ด และทดสอบการทำงานแล้ว"
                        rows={2}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="dialog-footer-sticky">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? 'กำลังบันทึก…'
                    : modal?.kind === 'split'
                    ? 'ยืนยันแบ่งล็อต'
                    : modal?.kind === 'request'
                    ? (splitOption === 'partial' && modal.asset.quantity > 1 ? 'ส่งคำขอ (ระบุจำนวน)' : 'ส่งคำขอ')
                    : 'บันทึก'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
