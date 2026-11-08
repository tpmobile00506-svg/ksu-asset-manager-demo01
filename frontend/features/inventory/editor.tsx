'use client';

import { useState, FormEvent } from 'react';
import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Asset,
  roles,
  conditions,
  requestTypes,
  money,
  satang,
  splitAmounts,
  standardBranches,
  fiscalYearOf,
  ADMIN_APPROVES_ALL,
  restoredCode,
} from '@/shared/domain';
import { Any, Pick, statusLabel, baht } from '@/frontend/components/common';
import type { WorkspaceData } from '@/shared/models';
import QrLabelModal from './qr-label-modal';
import PiecesEditor from './pieces-editor';
import { type PiecesState, initialPieces, resolvePieces, piecesProblem } from './pieces';
import AssetFormModal, {
  Field,
  BranchSelect,
  assetAmountInput,
  assetTotalInput,
  uploadCreatedAssetPhoto,
  deleteAssetPhoto,
} from './asset-form-modal';

// Re-export utility functions so tests and other components maintain backward compatibility
export { Field, assetAmountInput, assetTotalInput, uploadCreatedAssetPhoto, deleteAssetPhoto };

const prioritized = (object: Any, key: string) =>
  Object.entries(object).sort(([a], [b]) => (a === key ? -1 : b === key ? 1 : 0)) as [string, string][];

const titleMap: Record<string, string> = {
  create: 'เพิ่มครุภัณฑ์ใหม่',
  edit: 'แก้ไขข้อมูลครุภัณฑ์',
  import: 'ตรวจสอบและยืนยันนำเข้า',
  split: 'แยกรายการ',
  splitEach: 'แยกเป็นรายชิ้น',
  request: 'ยื่นคำขอ',
  approve: 'อนุมัติคำขอ',
  reject: 'ไม่อนุมัติคำขอ',
  cancelRequest: 'ยกเลิกคำขอ',
  password: 'เปลี่ยนรหัสผ่าน',
  round: 'เปิดรอบตรวจนับ',
  check: 'บันทึกผลตรวจนับ',
  user: 'กำหนดสิทธิ์ผู้ใช้',
  source: 'ข้อมูลต้นฉบับ',
  qr: 'ป้าย QR ประจำครุภัณฑ์',
  repairComplete: 'บันทึกผลการซ่อม',
  void: 'ยกเลิกรายการที่บันทึกผิด',
  restore: 'กู้คืนรายการที่ยกเลิก',
};

// ปุ่มยืนยันของแต่ละหน้าต่าง: บอกสิ่งที่จะเกิด ไม่ใช่แค่ "บันทึก"
const submitLabels: Record<string, string> = {
  void: 'ยกเลิกรายการนี้',
  restore: 'กู้คืนรายการ',
  split: 'แยกรายการ',
  splitEach: 'แยกเป็นรายชิ้น',
  request: 'ยื่นคำขอ',
  approve: 'อนุมัติ',
  reject: 'ไม่อนุมัติ',
  cancelRequest: 'ยกเลิกคำขอนี้',
  round: 'เปิดรอบตรวจนับ',
  check: 'บันทึกผลตรวจนับ',
  repairComplete: 'บันทึกซ่อมเสร็จ',
  password: 'เปลี่ยนรหัสผ่าน',
};

export default function Editor({
  data,
  setSelected,
  modal: currentModal,
  setModal,
  write,
  busy,
  error,
  setError,
  onPhotoChanged,
}: {
  data: WorkspaceData;
  setSelected: (a: Asset | null) => void;
  modal: Any | null;
  setModal: (m: Any | null) => void;
  write: (b: Any) => Promise<any>;
  busy: boolean;
  error: string;
  setError: (s: string) => void;
  onPhotoChanged: () => Promise<void>;
}) {
  // ระหว่างแอนิเมชันปิดหน้าต่าง ยังแสดงเนื้อหาเดิมไว้ (ไม่งั้นเห็นกรอบว่าง "หน้าต่างรายการ" แวบหนึ่ง)
  // การเปิด/ปิดหน้าต่างใช้ currentModal ส่วนเนื้อหาใช้ modal
  // จำหน้าต่างล่าสุดไว้ใน state (ปรับระหว่าง render ตามแบบ "เก็บค่าจาก render ก่อน" ของ React)
  // เดิมใช้ useRef แล้วอ่าน .current ระหว่าง render ซึ่ง React ไม่รับรองว่าจะได้ค่าที่ถูก
  const [lastModal, setLastModal] = useState<Any | null>(currentModal);
  if (currentModal && currentModal !== lastModal) setLastModal(currentModal);
  const modal = currentModal ?? lastModal;
  const [take, setTake] = useState(1);
  const [splitOption, setSplitOption] = useState<'all' | 'partial'>('all');
  const [requestSplitTake, setRequestSplitTake] = useState(1);
  const [requestKind, setRequestKind] = useState<string>('transfer');
  // แยกเป็นรายชิ้น: หมายเลขหลักเริ่มจากหมายเลขเดิม + ตารางหมายเลข/Serial รายชิ้น
  const [pieceBase, setPieceBase] = useState('');
  const [pieces, setPieces] = useState<PiecesState>(initialPieces);
  // เปิดหน้าต่างใหม่ (token ใหม่) → ล้างค่าที่กรอกค้างในฟอร์มแบ่งล็อต/ยื่นคำขอ
  const [formToken, setFormToken] = useState(modal?.token);
  if (modal?.token !== formToken) {
    setFormToken(modal?.token);
    if (modal?.kind === 'split') {
      setTake(1);
    }
    if (modal?.kind === 'splitEach') {
      setPieceBase(modal.asset.code);
      setPieces(initialPieces());
    }
    if (modal?.kind === 'request') {
      setSplitOption('all');
      setRequestSplitTake(1);
      setRequestKind('transfer');
    }
  }
  const user = modal?.user;
  const creatingUser = !user?.id || !!user.invited;

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
          reason: f.reason,
        });
      } else if (modal.kind === 'splitEach') {
        const list = resolvePieces(pieces, pieceBase, modal.asset.quantity);
        // หมายเลขชิ้นห้ามซ้ำกับหมายเลขเดิมของรายการ (รายการเดิมยังอยู่ในประวัติ)
        const problem = piecesProblem(list, modal.asset.code, 'หมายเลขเดิมของรายการนี้');
        if (problem) {
          setError(problem);
          return;
        }
        await write({
          action: 'splitEach',
          id: modal.asset.id,
          version: modal.asset.version,
          reason: f.reason,
          pieces: list,
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
            estimateSatang: satang(f.cost || 0),
          },
          reason: f.reason,
        });
      } else if (['approve', 'reject', 'cancelRequest'].includes(modal.kind)) {
        await write({
          action: modal.kind,
          id: modal.request.id,
          version: modal.request.version,
          reason: f.reason,
        });
      } else if (modal.kind === 'password') {
        if (f.password !== f.confirm) {
          setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
          return;
        }
        await write({ action: 'password', currentPassword: f.currentPassword, password: f.password });
      } else if (modal.kind === 'round') {
        await write({
          action: 'round',
          name: f.name,
          year: Number(f.year),
        });
      } else if (modal.kind === 'check') {
        await write({
          action: 'check',
          id: modal.item.id,
          expectedCheckedAt: modal.item.checkedAt ?? null,
          result: f.result,
          quantity: Number(f.quantity),
          reason: f.reason,
        });
      } else if (modal.kind === 'user') {
        await write({
          action: 'user',
          name: f.name,
          email: f.email,
          role: f.role,
          ...(f.branch ? { branch: f.branch } : user?.branch ? { branch: null } : {}),
          active: f.active === 'on',
          ...(f.password ? { password: f.password } : {}),
        });
      } else if (modal.kind === 'repairComplete') {
        await write({
          action: 'repairComplete',
          id: modal.asset.id,
          version: modal.asset.version,
          costSatang: satang(f.cost),
          repairedBy: f.repairedBy,
          reason: f.reason,
        });
      } else if (modal.kind === 'void' || modal.kind === 'restore') {
        await write({
          action: modal.kind,
          id: modal.asset.id,
          version: modal.asset.version,
          reason: f.reason,
        });
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      {/* 1. หน้าต่างพิมพ์ป้าย QR Code */}
      <QrLabelModal open={currentModal?.kind === 'qr'} onClose={() => setModal(null)} assets={modal?.assets || []} />

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

      {/* 4. หน้าต่างอื่น ๆ (แยกรายการ, คำขอ, ตรวจนับ, ผู้ใช้, ซ่อมเสร็จ, ข้อมูลต้นฉบับ) */}
      <Dialog
        open={!!currentModal && !['create', 'edit', 'import', 'qr', 'bulkEdit'].includes(currentModal.kind)}
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
                (modal?.kind === 'password' ? 'ใช้ได้ทุกบทบาท' : '') ||
                'ระบบบันทึกชื่อผู้ทำรายการและเวลาไว้ทุกครั้ง'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="error mx-7 mt-3" role="alert">
              {error}
            </div>
          )}

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
                  ),
              )}
              <div className="notice">
                ชีต {modal.row.sheet} · แถว {modal.row.row} · ข้อความต้นฉบับยังอยู่ครบ
                {modal.row.groupName && <p className="mt-2">เสนอเก็บเป็นหมวด: {modal.row.groupName}</p>}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} key={modal?.token} className="flex flex-col flex-1 min-h-0">
              <div className="dialog-scroll-body">
                {modal?.kind === 'split' && (
                  <>
                    <div className="notice">
                      จำนวนเดิม {modal.asset.quantity} ชิ้น · มูลค่า {baht(modal.asset.totalSatang)} ·
                      รายการเดิมยังอยู่ในประวัติ
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
                        สภาพของส่วนที่แยก
                        <Pick name="condition" label="สภาพของส่วนที่แยก" options={prioritized(conditions, 'damaged')} />
                      </label>
                    </div>
                    <div className="split-preview">
                      <div>
                        <p>ส่วนที่แยก</p>
                        <b>{take || 0} ชิ้น</b>
                        <p>
                          {Number.isInteger(take) && take > 0 && take < modal.asset.quantity
                            ? money(splitAmounts(modal.asset.quantity, modal.asset.totalSatang, take)[0])
                            : '—'}{' '}
                          บาท
                        </p>
                      </div>
                      <div>
                        <p>ส่วนที่เหลือ · {statusLabel(modal.asset.condition)}</p>
                        <b>{Math.max(0, modal.asset.quantity - take)} ชิ้น</b>
                        <p>
                          {Number.isInteger(take) && take > 0 && take < modal.asset.quantity
                            ? money(splitAmounts(modal.asset.quantity, modal.asset.totalSatang, take)[1])
                            : '—'}{' '}
                          บาท
                        </p>
                      </div>
                    </div>
                    <div className="form-grid form-grid-single mt-4">
                      <label>
                        <span>เหตุผลที่แยกรายการ *</span>
                        <Textarea
                          name="reason"
                          required
                          placeholder="เช่น ชำรุดบางส่วน หรือแยกตามห้องใช้งานจริง"
                          rows={2}
                        />
                      </label>
                    </div>
                  </>
                )}

                {/* แยกเป็นรายชิ้น: รายการกลุ่ม N ชิ้น → N รายการ QR คนละดวง (ผู้ใช้ขอ 8 พ.ย. 2569) */}
                {modal?.kind === 'splitEach' && (
                  <>
                    <div className="notice">
                      {modal.asset.code} · {modal.asset.quantity.toLocaleString('th-TH')} ชิ้น · มูลค่า{' '}
                      {baht(modal.asset.totalSatang)}
                      <p>
                        จะได้ {modal.asset.quantity.toLocaleString('th-TH')} รายการ รายการละ 1 ชิ้น QR ไม่ซ้ำกัน
                        แบ่งมูลค่าเท่ากันทุกชิ้น และรายการเดิมยังอยู่ในประวัติ
                      </p>
                    </div>
                    <div className="form-grid form-grid-single mt-4">
                      <label>
                        <span>หมายเลขหลัก</span>
                        <Input
                          value={pieceBase}
                          onChange={e => {
                            setPieceBase(e.target.value);
                            if (Object.keys(pieces.edited).length) setPieces(p => ({ ...p, edited: {} }));
                          }}
                          className="font-mono"
                        />
                        <small className="text-xs text-slate-500 mt-1 block">
                          ใช้ตั้งต้นหมายเลขของแต่ละชิ้น แก้รายชิ้นได้ในตารางด้านล่าง
                        </small>
                      </label>
                    </div>
                    <PiecesEditor
                      base={pieceBase}
                      quantity={modal.asset.quantity}
                      value={pieces}
                      onChange={setPieces}
                    />
                    <div className="form-grid form-grid-single mt-4">
                      <label>
                        <span>เหตุผลที่แยกเป็นรายชิ้น *</span>
                        <Textarea name="reason" required placeholder="เช่น ติด QR แยกทุกเครื่อง" rows={2} />
                      </label>
                    </div>
                  </>
                )}

                {modal?.kind === 'request' && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="font-semibold text-slate-800 truncate min-w-0">{modal.asset.name}</span>
                        <span className="font-mono text-slate-500 min-w-0">{modal.asset.code}</span>
                      </div>
                      <div className="text-slate-500">
                        จำนวนทั้งหมด <b>{modal.asset.quantity}</b> ชิ้น · {modal.asset.branch}{' '}
                        {modal.asset.location ? `(${modal.asset.location})` : ''} · มูลค่ารวม{' '}
                        {baht(modal.asset.totalSatang)}
                      </div>
                    </div>

                    <Pick
                      name="requestKind"
                      label="ประเภทคำขอ"
                      value={requestKind}
                      onChange={setRequestKind}
                      options={[
                        ['transfer', 'โอนย้าย (สถานที่ / สาขา / ผู้รับผิดชอบ)'],
                        ['repair', 'ส่งซ่อม'],
                        ['disposal', 'จำหน่าย'],
                      ]}
                    />

                    {modal.asset.quantity > 1 && (
                      <div className="rounded-xl border border-blue-200/90 bg-blue-50/60 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Scissors size={14} className="text-blue-600" />
                            ยื่นคำขอกี่ชิ้น
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            (มีทั้งหมด {modal.asset.quantity} ชิ้น)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <label
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${splitOption === 'all' ? 'bg-white border-blue-500 shadow-xs font-semibold text-blue-900 ring-1 ring-blue-500/20' : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'}`}
                          >
                            <input
                              type="radio"
                              name="splitChoice"
                              value="all"
                              checked={splitOption === 'all'}
                              onChange={() => setSplitOption('all')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div>ทั้งหมด</div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                ทั้งหมด {modal.asset.quantity} ชิ้น
                              </div>
                            </div>
                          </label>

                          <label
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${splitOption === 'partial' ? 'bg-white border-blue-500 shadow-xs font-semibold text-blue-900 ring-1 ring-blue-500/20' : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'}`}
                          >
                            <input
                              type="radio"
                              name="splitChoice"
                              value="partial"
                              checked={splitOption === 'partial'}
                              onChange={() => setSplitOption('partial')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div>บางส่วน</div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                ระบุจำนวน (ระบบแยกรายการเมื่ออนุมัติ)
                              </div>
                            </div>
                          </label>
                        </div>

                        {splitOption === 'partial' && (
                          <div className="pt-2.5 border-t border-blue-100 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                จำนวนที่ยื่นคำขอ:
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
                                <p className="text-blue-700 font-medium">
                                  ส่วนที่ยื่นคำขอ ({requestTypes[requestKind as keyof typeof requestTypes] || 'คำขอ'})
                                </p>
                                <b>{requestSplitTake || 0} ชิ้น</b>
                                <p className="text-slate-500 text-xs mt-0.5">
                                  {Number.isInteger(requestSplitTake) &&
                                  requestSplitTake > 0 &&
                                  requestSplitTake < modal.asset.quantity
                                    ? money(
                                        splitAmounts(
                                          modal.asset.quantity,
                                          modal.asset.totalSatang,
                                          requestSplitTake,
                                        )[0],
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
                                          requestSplitTake,
                                        )[1],
                                      )
                                    : '—'}{' '}
                                  บาท
                                </p>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              ระบบจะแยก {requestSplitTake} ชิ้นออกเป็นรายการใหม่เมื่ออนุมัติขั้นสุดท้าย ระหว่างรอ
                              รายการเดิมยังไม่เปลี่ยน ถ้าไม่อนุมัติหรือยกเลิกคำขอก็ไม่มีการแยก ส่วนที่เหลืออีก{' '}
                              {modal.asset.quantity - requestSplitTake} ชิ้นใช้งานตามปกติ
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="form-grid">
                      {requestKind === 'transfer' && (
                        <>
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
                            wide
                            label="ผู้รับผิดชอบใหม่ (ถ้ามี)"
                            name="custodian"
                            placeholder={
                              modal.asset.custodian ? `ปัจจุบัน: ${modal.asset.custodian}` : 'เว้นว่างถ้าไม่เปลี่ยน'
                            }
                          />
                        </>
                      )}

                      {requestKind === 'repair' && (
                        <Field wide label="ประมาณการค่าซ่อม (บาท)" name="cost" placeholder="0.00" />
                      )}

                      {requestKind === 'disposal' && (
                        <div className="span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg p-2.5">
                          เมื่ออนุมัติครบทุกขั้น ครุภัณฑ์ส่วนนี้จะย้ายไปหมวด “จำหน่ายแล้ว” และไม่นับในทะเบียนที่ใช้อยู่
                        </div>
                      )}

                      <label className="span-2">
                        <span>เหตุผลและความจำเป็น *</span>
                        <Textarea
                          name="reason"
                          required
                          placeholder="เช่น ชำรุดใช้งานไม่ได้ หรือย้ายไปใช้สอนที่ห้อง 402"
                          rows={3}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {modal && ['approve', 'reject', 'cancelRequest'].includes(modal.kind) && (
                  <div className="form-grid form-grid-single">
                    <div className="notice">
                      {requestTypes[modal.request.kind as keyof typeof requestTypes]} · {modal.request.name}
                      <p className="mono">{modal.request.code}</p>
                      {modal.request.requesterName && (
                        <p className="mt-1">
                          ผู้ยื่นคำขอ: <b>{modal.request.requesterName}</b>
                        </p>
                      )}
                      {modal.kind === 'approve' && ADMIN_APPROVES_ALL && data.me.role === 'admin' && (
                        <p className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-teal-800">
                          ผู้ดูแลระบบ: กดอนุมัติแล้วคำขอนี้จะ
                          <b>อนุมัติครบทุกขั้นทันที</b> (ข้ามขั้นที่เหลือ) และทะเบียนจะเปลี่ยนตามคำขอ
                        </p>
                      )}
                      <p className="mt-1">เหตุผลของผู้ขอ: {modal.request.reason}</p>
                      {/* สิ่งที่จะเกิดขึ้นเมื่ออนุมัติ: ผู้อนุมัติต้องเห็นปลายทาง/จำนวนก่อนตัดสินใจ */}
                      {(() => {
                        let p: Record<string, any> = {};
                        try {
                          p = JSON.parse(modal.request.payload || '{}');
                        } catch {
                          /* ไม่มีรายละเอียด */
                        }
                        return (
                          <>
                            {modal.request.kind === 'transfer' && (
                              <>
                                {p.from?.location && (
                                  <p className="mt-1">
                                    จาก: <b>{p.from.location}</b> · {p.from.branch || '—'}
                                    {p.from.custodian ? ` · ผู้รับผิดชอบเดิม: ${p.from.custodian}` : ''}
                                  </p>
                                )}
                                <p className="mt-1">
                                  ย้ายไป: <b>{p.location || '—'}</b> · {p.branch || '—'}
                                  {p.custodian ? ` · ผู้รับผิดชอบใหม่: ${p.custodian}` : ''}
                                </p>
                              </>
                            )}
                            {modal.request.kind === 'repair' && (
                              <p className="mt-1">
                                ค่าซ่อมประมาณ: <b>{baht(Number(p.estimateSatang) || 0)}</b>
                              </p>
                            )}
                            {p.splitQuantity ? (
                              <p className="mt-1">
                                จำนวน: <b>เฉพาะ {p.splitQuantity} ชิ้น</b> (ระบบแยกรายการเมื่ออนุมัติขั้นสุดท้าย)
                              </p>
                            ) : p.setId ? (
                              <p className="mt-1">
                                จำนวน: <b>ทั้งชุด {p.setCount ?? ''} รายการ</b> (ชุดห้ามแยก)
                              </p>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    {modal.kind === 'reject' && (
                      <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                        ไม่อนุมัติแล้วคำขอนี้จะสิ้นสุด ถ้าผู้ยื่นยังต้องการต้องยื่นคำขอใหม่
                      </p>
                    )}
                    {modal.kind === 'cancelRequest' && (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                        ยกเลิกแล้วคำขอนี้จะสิ้นสุด ทะเบียนไม่เปลี่ยน ลายเซ็นที่มีแล้วยังอยู่ในประวัติ
                      </p>
                    )}
                    <label>
                      <span>
                        {modal.kind === 'approve'
                          ? 'ความเห็น (ถ้ามี)'
                          : modal.kind === 'reject'
                            ? 'เหตุผลที่ไม่อนุมัติ'
                            : 'เหตุผลที่ยกเลิก (ถ้ามี)'}
                        {modal.kind === 'reject' && <span className="text-rose-600 font-bold ml-1">*</span>}
                      </span>
                      <Textarea
                        name="reason"
                        required={modal.kind === 'reject'}
                        placeholder={
                          modal.kind === 'reject'
                            ? 'เช่น ยังซ่อมได้ ให้ส่งซ่อมก่อน'
                            : modal.kind === 'cancelRequest'
                              ? 'เช่น ยื่นผิดรายการ'
                              : 'เช่น เห็นควรอนุมัติ'
                        }
                        rows={3}
                      />
                    </label>
                  </div>
                )}

                {modal?.kind === 'password' && (
                  <div className="form-grid form-grid-single">
                    <div className="notice">
                      {data.me.name} · {data.me.email}
                      <p className="mt-1">เปลี่ยนแล้วระบบจะออกจากระบบทุกเครื่อง ให้เข้าใหม่ด้วยรหัสผ่านใหม่</p>
                    </div>
                    <Field
                      label="รหัสผ่านเดิม"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                    <Field
                      label="รหัสผ่านใหม่"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      hint="อย่างน้อย 12 ตัวอักษร"
                    />
                    <Field
                      label="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                  </div>
                )}

                {modal?.kind === 'round' && (
                  <div className="form-grid">
                    <Field
                      label="ชื่อรอบตรวจนับ"
                      name="name"
                      placeholder={`เช่น ตรวจนับประจำปีงบประมาณ ${fiscalYearOf(new Date())}`}
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
                    <div className="form-grid">
                      <label>
                        <span>ผลการตรวจนับ *</span>
                        <Pick
                          name="result"
                          label="ผลการตรวจนับ"
                          defaultValue={
                            modal.item.result && modal.item.result !== 'pending'
                              ? modal.item.result === 'matched'
                                ? 'normal'
                                : modal.item.result
                              : 'normal'
                          }
                          options={[
                            ['normal', 'ตรงตามทะเบียน'],
                            ['damaged', 'พบแต่ชำรุด'],
                            ['missing', 'ไม่พบ'],
                            ['mismatch', 'ข้อมูลไม่ตรง'],
                          ]}
                        />
                      </label>
                      <Field
                        label="จำนวนที่พบจริง (ชิ้น)"
                        name="quantity"
                        type="number"
                        min={0}
                        defaultValue={modal.item.quantity ?? JSON.parse(modal.item.snapshot).quantity}
                        required
                      />
                      <label className="span-2">
                        <span>หมายเหตุ</span>
                        <Textarea
                          name="reason"
                          placeholder="เช่น ชำรุดจอแตก หรือ อยู่ระหว่างยืมใช้งาน"
                          defaultValue={modal.item.notes ?? ''}
                          rows={2}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {modal?.kind === 'user' && (
                  <div className="form-grid form-grid-single">
                    <Field label="ชื่อ-นามสกุล" name="name" defaultValue={user?.name ?? ''} required />
                    <Field
                      label="อีเมล"
                      name="email"
                      type="email"
                      defaultValue={user?.email ?? ''}
                      readOnly={!creatingUser}
                      required
                    />
                    <label>
                      <span>บทบาท *</span>
                      <Pick
                        name="role"
                        label="บทบาท"
                        defaultValue={user?.role ?? 'staff'}
                        options={Object.entries(roles).map(([r, label]) => [r, label])}
                      />
                    </label>
                    <label>
                      <span>สาขา/หน่วยงาน</span>
                      <Pick
                        name="branch"
                        label="สาขา/หน่วยงาน"
                        defaultValue={user?.branch ?? ''}
                        options={[
                          ['', '— ไม่ระบุ / ส่วนกลาง —'],
                          ...standardBranches.map(b => [b, b] as [string, string]),
                        ]}
                      />
                    </label>
                    <Field
                      label={
                        creatingUser
                          ? 'รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)'
                          : 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'
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
                      <Checkbox name="active" defaultChecked={Boolean(user?.active ?? true)} />
                      <span>เปิดใช้งานบัญชีนี้</span>
                    </label>
                  </div>
                )}

                {modal?.kind === 'repairComplete' && (
                  <div className="form-grid form-grid-single">
                    <div className="notice">
                      <b>{modal.asset.name}</b>
                      <p className="mono">{modal.asset.code}</p>
                      <p className="mt-1">สภาพตอนนี้: กำลังซ่อม · บันทึกแล้วจะเปลี่ยนเป็น “ปกติ”</p>
                    </div>
                    <Field
                      label="ผู้ซ่อม / ร้านที่ซ่อม"
                      name="repairedBy"
                      placeholder="เช่น ช่างภายในคณะ หรือ ร้านเอ บี เซอร์วิส"
                      required
                    />
                    <Field label="ค่าซ่อมจริง (บาท)" name="cost" placeholder="0.00" required />
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

                {modal?.kind === 'void' && (
                  <div className="form-grid form-grid-single">
                    <div className="notice">
                      <b>{modal.asset.name}</b>
                      <p className="mono">{modal.asset.code}</p>
                      <p className="mt-1">
                        {modal.asset.quantity.toLocaleString('th-TH')} ชิ้น · มูลค่า {baht(modal.asset.totalSatang)}
                      </p>
                    </div>
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      ใช้เมื่อ<b>บันทึกผิด</b>เท่านั้น เช่น เพิ่มซ้ำ เพิ่มผิดชิ้น หรือใส่ราคา/จำนวนผิด
                      (ถ้าของถูกจำหน่ายจริง ให้ยื่นคำขอจำหน่ายแทน)
                      <ul className="mt-1 list-disc pl-5">
                        <li>รายการจะย้ายไปหมวด “ข้อมูลผิดพลาด” ไม่นับในทะเบียน รายงาน และไฟล์ Excel</li>
                        <li>หมายเลขเดิมว่าง เพิ่มรายการที่ถูกต้องใหม่ได้ · ประวัติยังเก็บไว้ตรวจย้อนหลัง</li>
                        <li>กู้คืนได้ภายหลังจากหมวด “ข้อมูลผิดพลาด” ถ้าหมายเลขเดิมยังไม่ถูกใช้กับรายการใหม่</li>
                      </ul>
                    </div>
                    <label>
                      <span>เหตุผลที่ยกเลิก *</span>
                      <Textarea
                        required
                        name="reason"
                        placeholder="เช่น ใส่ราคาผิด 15,000 ที่ถูกคือ 1,500 จะเพิ่มรายการใหม่ให้ถูกต้อง"
                        rows={2}
                      />
                    </label>
                  </div>
                )}

                {modal?.kind === 'restore' && (
                  <div className="form-grid form-grid-single">
                    <div className="notice">
                      <b>{modal.asset.name}</b>
                      <p className="mono">{modal.asset.code}</p>
                      <p className="mt-1">
                        กู้คืนแล้วใช้หมายเลข <b className="mono">{restoredCode(modal.asset.code, modal.asset.id)}</b> ·{' '}
                        {modal.asset.quantity.toLocaleString('th-TH')} ชิ้น · มูลค่า {baht(modal.asset.totalSatang)}
                      </p>
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      รายการจะกลับเข้า<b>ทะเบียนครุภัณฑ์</b> และนับในรายงานกับไฟล์ Excel อีกครั้ง
                      <ul className="mt-1 list-disc pl-5">
                        <li>ถ้าหมายเลขเดิมถูกใช้กับรายการใหม่ไปแล้ว จะกู้คืนไม่ได้ (ระบบจะบอกว่าซ้ำกับรายการไหน)</li>
                        <li>ไม่ถูกใส่กลับเข้ารอบตรวจนับที่เปิดอยู่ เหมือนรายการที่เพิ่มหลังเปิดรอบ</li>
                      </ul>
                    </div>
                    <label>
                      <span>เหตุผลที่กู้คืน *</span>
                      <Textarea required name="reason" placeholder="เช่น กดยกเลิกผิดรายการ" rows={2} />
                    </label>
                  </div>
                )}
              </div>

              <div className="dialog-footer-sticky">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setModal(null)}>
                  ปิด
                </Button>
                <Button
                  type="submit"
                  disabled={busy}
                  variant={['void', 'reject', 'cancelRequest'].includes(modal?.kind) ? 'destructive' : 'default'}
                >
                  {busy ? 'กำลังบันทึก…' : (submitLabels[modal?.kind || ''] ?? 'บันทึก')}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
