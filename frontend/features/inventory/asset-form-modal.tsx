'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { Upload, ImageIcon, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Asset,
  conditions,
  satang,
  assetTypes,
  assetTypeOf,
  assetGroups,
  assetGroupOfType,
  UNGROUPED,
  academicBranches,
  officeBranches,
  isStandardBranch,
} from '@/shared/domain';
import { Any, api, Pick, sessionFetch, readApiResponse, getSessionSignal } from '@/frontend/components/common';
import { WorkspaceData } from '@/frontend/types/models';
import PiecesEditor from './pieces-editor';
import { type PiecesState, initialPieces, resolvePieces, piecesProblem } from './pieces';

// ช่องเลือกทุกช่องในฟอร์มใช้หน้าตาเดียวกัน ให้ช่องที่อยู่ข้างกันสมส่วน
const selectClass =
  'h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// สาขาวิชา / หน่วยงาน: เลือกจากรายการมาตรฐานเท่านั้น แยกกลุ่มสาขาวิชากับหน่วยงาน
// ค่าเดิมที่ไม่อยู่ในรายการ (ข้อมูลเก่า) แสดงไว้ให้เห็น แต่บันทึกได้เมื่อเลือกค่ามาตรฐานแทนเท่านั้น
export function BranchSelect({
  name,
  defaultValue,
  onChange,
  required = true,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
}) {
  const legacy = defaultValue && !isStandardBranch(defaultValue) ? defaultValue : '';
  return (
    <select
      name={name}
      defaultValue={legacy ? '' : defaultValue || ''}
      onChange={onChange}
      required={required}
      className={selectClass}
    >
      <option value="" disabled>
        {legacy ? `ค่าเดิม "${legacy}" ไม่อยู่ในรายการ กรุณาเลือกใหม่` : 'เลือกสาขา/หน่วยงาน'}
      </option>
      <optgroup label="สาขาวิชา">
        {academicBranches.map(branch => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </optgroup>
      <optgroup label="หน่วยงาน">
        {officeBranches.map(branch => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function Field({
  label,
  name,
  value,
  defaultValue,
  type = 'text',
  required = false,
  wide = false,
  readOnly = false,
  min,
  minLength,
  maxLength,
  autoComplete,
  placeholder,
  onChange,
  hint,
  list,
}: {
  label: string;
  name: string;
  value?: string | number;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  wide?: boolean;
  readOnly?: boolean;
  min?: string | number;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  placeholder?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  list?: string;
}) {
  return (
    <label className={wide ? 'span-2' : ''}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <Input
        name={name}
        value={value}
        defaultValue={defaultValue}
        type={type}
        required={required}
        readOnly={readOnly}
        min={min}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={onChange}
        step={type === 'number' ? '1' : undefined}
        list={list}
      />
      {hint && <small className="text-xs text-slate-500 mt-1 block">{hint}</small>}
    </label>
  );
}

const prioritized = (object: Any, key: string) =>
  Object.entries(object).sort(([a], [b]) => (a === key ? -1 : b === key ? 1 : 0)) as [string, string][];

export function assetAmountInput(value: number | bigint): string {
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

export function assetTotalInput(unitPrice: string, quantity: number): string {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
    throw new Error('จำนวนต้องเป็นจำนวนเต็ม 1–1,000,000');
  }
  const total = BigInt(satang(unitPrice)) * BigInt(quantity);
  if (total > 100000000000000n) throw new Error('จำนวนเงินเกินขอบเขตที่รองรับ');
  return assetAmountInput(total);
}

export async function uploadCreatedAssetPhoto(assetId: string, file: File, signal: AbortSignal, expectedVersion = '') {
  const body = new FormData();
  body.set('assetId', assetId);
  body.set('expectedVersion', expectedVersion);
  body.set('file', file);
  const result = await readApiResponse(await sessionFetch('/api/asset-image', { method: 'POST', body, signal }));
  signal.throwIfAborted();
  if (result.ok !== true || typeof result.imageVersion !== 'string') {
    throw new Error('ได้ผลบันทึกรูปไม่ครบ กรุณาเปิดรายละเอียดเพื่อตรวจสอบ');
  }
  return result;
}

export async function deleteAssetPhoto(assetId: string, expectedVersion: string, signal: AbortSignal) {
  const result = await readApiResponse(
    await sessionFetch('/api/asset-image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, expectedVersion }),
      signal,
    }),
  );
  signal.throwIfAborted();
  if (result.ok !== true) {
    throw new Error('ลบรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  return result;
}

export default function AssetFormModal({
  open,
  onClose,
  modal,
  data,
  write,
  busy,
  setSelected,
  onPhotoChanged,
  error,
  setError,
}: {
  open: boolean;
  onClose: () => void;
  modal: Any | null;
  data: WorkspaceData;
  write: (b: Any) => Promise<any>;
  busy: boolean;
  setSelected: (a: Asset | null) => void;
  onPhotoChanged: () => Promise<void>;
  error: string;
  setError: (s: string) => void;
}) {
  const [qtyInput, setQtyInput] = useState<number | ''>(1);
  const [priceInput, setPriceInput] = useState<string>('');
  const [totalInput, setTotalInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>('');
  const [newPhoto, setNewPhoto] = useState<{ file: File; url: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [currentImageFailed, setCurrentImageFailed] = useState(false);
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [branchInput, setBranchInput] = useState<string>('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  // ติด QR แบบไหน (ของหลายชิ้นตอนเพิ่ม/นำเข้า): '' = ยังไม่เลือก (ต้องเลือกเองทุกครั้ง กันกรอกผิดแบบ)
  const [codeInput, setCodeInput] = useState('');
  const [qrMode, setQrMode] = useState<'' | 'group' | 'each'>('');
  const [pieces, setPieces] = useState<PiecesState>(initialPieces);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal && ['create', 'edit', 'import'].includes(modal.kind)) {
      // ไม่เลือกสาขาให้ล่วงหน้า (เดิมตั้งเป็นสำนักงานคณบดี ของจึงเข้าผิดสาขาง่าย) ยกเว้นหน้าทะเบียนกรองสาขาไว้อยู่
      const b = modal.asset?.branch || modal.initialBranch || '';
      // ประเภทแบบสั้นในข้อมูลเก่า (เช่น "คอมพิวเตอร์") แปลงเป็นชื่อเต็มในรายการ
      const raw = modal.asset?.category || '';
      const c = assetTypeOf(raw) || assetTypeOf('ครุภัณฑ์' + raw) || raw;
      setBranchInput(b);
      setCategoryInput(c);
      setCodeInput(modal.asset?.code || '');
      setQrMode('');
      setPieces(initialPieces());

      if (modal.asset) {
        const q = modal.asset.quantity || 1;
        const p = assetAmountInput(modal.asset.unitSatang ?? 0);
        const t = assetAmountInput(modal.asset.totalSatang ?? 0);
        setQtyInput(q);
        setPriceInput(p);
        setTotalInput(t);
        setDateInput(modal.asset.receivedDate || '');
      } else {
        setQtyInput(1);
        setPriceInput('');
        setTotalInput('');
        setDateInput('');
      }
      setNewPhoto(null);
      setRemovePhoto(false);
      setCurrentImageFailed(false);
    }
  }, [modal?.token]);

  const handleBranchChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setBranchInput(e.target.value);
  };

  useEffect(() => {
    return () => {
      if (newPhoto?.url) URL.revokeObjectURL(newPhoto.url);
    };
  }, [newPhoto?.url]);

  const handleQtyChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextQty = e.target.value === '' ? '' : Number(e.target.value);
    setQtyInput(nextQty);
    if (nextQty !== '' && priceInput.trim() !== '') {
      try {
        setTotalInput(assetTotalInput(priceInput, nextQty));
      } catch {
        setTotalInput('');
      }
    } else {
      setTotalInput('');
    }
  };

  const handlePriceChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextPrice = e.target.value;
    setPriceInput(nextPrice);
    if (nextPrice.trim() !== '' && qtyInput !== '') {
      try {
        setTotalInput(assetTotalInput(nextPrice, qtyInput));
      } catch {
        setTotalInput('');
      }
    } else {
      setTotalInput('');
    }
  };

  const handleTotalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTotalInput(e.target.value);
  };

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('กรุณาเลือกไฟล์ JPEG, PNG หรือ WebP เท่านั้น');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('ขนาดไฟล์รูปต้องไม่เกิน 4 MB');
      return;
    }
    if (newPhoto?.url) URL.revokeObjectURL(newPhoto.url);
    setNewPhoto({ file, url: URL.createObjectURL(file) });
    setRemovePhoto(false);
  };

  // ตัวเลือก "ติด QR แบบไหน" ขึ้นเมื่อเพิ่ม/นำเข้าของหลายชิ้น ยกเว้นแถวที่อยู่ในชุดห้ามแยก (ต้องเป็นรายการเดียวตามเดิม)
  const qrChoiceFor = (qty: number) =>
    !!modal && ['create', 'import'].includes(modal.kind) && qty > 1 && !modal.row?.set;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const signal = getSessionSignal();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());

    try {
      const a = {
        ...modal.asset,
        ...f,
        quantity: Number(f.quantity || qtyInput),
        unitSatang: satang(f.unitPrice || priceInput),
        totalSatang: satang(f.totalPrice || totalInput),
        lifeYears: Number(f.lifeYears || 0),
        salvageSatang: satang(f.salvage || 0),
      };

      // ของหลายชิ้น: ต้องเลือกแบบ QR ก่อน · แยกรายชิ้นส่งหมายเลข/Serial ของทุกชิ้นไปด้วย
      const choosing = qrChoiceFor(a.quantity);
      if (choosing && !qrMode) {
        setError('กรุณาเลือกว่าจะติด QR แบบไหน: QR เดียวทั้งกลุ่ม หรือ QR แยกรายชิ้น');
        return;
      }
      const each = choosing && qrMode === 'each';
      const pieceList = each ? resolvePieces(pieces, String(a.code ?? ''), a.quantity) : undefined;
      if (pieceList) {
        const problem = piecesProblem(pieceList, String(a.code ?? ''));
        if (problem) {
          setError(problem);
          return;
        }
      }

      const res = await write({
        action: modal.kind,
        asset: a,
        id: modal.asset?.id,
        version: modal.asset?.version,
        sourceId: modal.sourceId,
        sourceRow: modal.row?.key,
        reviewed: f.reviewed === 'on',
        reason: f.reason || '',
        pieces: pieceList,
      });

      const targetAssetId = modal.kind === 'edit' ? modal.asset?.id : res?.id;
      const currentVersion = modal.asset?.imageVersion || '';

      // แยกรายชิ้น: ไม่แนบรูปตอนเพิ่ม (ช่องรูปซ่อนไว้) เพิ่มรูปทีหลังที่หน้าข้อมูลของแต่ละชิ้น
      if (res && targetAssetId && !each) {
        if (newPhoto?.file) {
          let imageSaved = false;
          try {
            signal.throwIfAborted();
            await uploadCreatedAssetPhoto(targetAssetId, newPhoto.file, signal, currentVersion);
            imageSaved = true;
            await onPhotoChanged();
          } catch (photoErr) {
            if (signal.aborted) return;
            toast.warning(
              imageSaved ? 'บันทึกรูปแล้ว แต่โหลดทะเบียนใหม่ไม่สำเร็จ' : 'บันทึกข้อมูลครุภัณฑ์แล้ว แต่แนบรูปไม่สำเร็จ',
              {
                description: `${
                  photoErr instanceof Error ? photoErr.message : 'เชื่อมต่อระบบไม่สำเร็จ'
                } เปิดรายละเอียดเพื่อตรวจสอบหรือเพิ่มรูปอีกครั้ง ไม่ต้องสร้างรายการใหม่`,
                duration: Infinity,
                action: {
                  label: 'เปิดรายละเอียด',
                  onClick: async () => {
                    if (signal.aborted) return;
                    try {
                      const current = await api();
                      signal.throwIfAborted();
                      const saved = current.assets.find((asset: Asset) => asset.id === targetAssetId);
                      if (!saved) throw new Error('ไม่พบรายการที่บันทึก กรุณาโหลดทะเบียนใหม่');
                      setSelected(saved);
                    } catch (cause) {
                      if (!signal.aborted)
                        toast.error(
                          cause instanceof Error ? cause.message : 'เปิดรายละเอียดไม่สำเร็จ กรุณาค้นหารายการในทะเบียน',
                        );
                    }
                  },
                },
                cancel: { label: 'ปิด', onClick: () => {} },
              },
            );
          }
        } else if (modal.kind === 'edit' && removePhoto && currentVersion) {
          try {
            signal.throwIfAborted();
            await deleteAssetPhoto(targetAssetId, currentVersion, signal);
            await onPhotoChanged();
          } catch (photoErr) {
            if (signal.aborted) return;
            toast.warning('บันทึกข้อมูลครุภัณฑ์แล้ว แต่ลบรูปภาพไม่สำเร็จ', {
              description: photoErr instanceof Error ? photoErr.message : 'เชื่อมต่อระบบไม่สำเร็จ',
            });
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!open || !modal || !['create', 'edit', 'import'].includes(modal.kind)) {
    return null;
  }

  const titleMap: Record<string, string> = {
    create: 'เพิ่มครุภัณฑ์ใหม่',
    edit: 'แก้ไขข้อมูลครุภัณฑ์',
    import: 'ตรวจสอบและยืนยันนำเข้า',
  };

  const currentPhotoUrl =
    modal?.asset?.imageUrl ||
    (modal?.asset?.id && modal?.asset?.imageVersion
      ? `/api/asset-image?asset=${encodeURIComponent(modal.asset.id)}&v=${encodeURIComponent(modal.asset.imageVersion)}`
      : null);

  const choosingQr = qrChoiceFor(Number(qtyInput) || 0);
  const eachMode = choosingQr && qrMode === 'each';

  const conditionOptions = prioritized(conditions, modal.asset?.condition || 'normal').filter(([condition]) =>
    modal.kind === 'create'
      ? condition !== 'repair' && condition !== 'missing' // เพิ่มของใหม่: ไม่มี "กำลังซ่อม" (ต้องผ่านคำขอซ่อม) และ "ไม่พบ" (ของที่เพิ่งรับมาต้องมีอยู่)
      : modal.kind !== 'edit'
        ? condition !== 'repair' // นำเข้าจากไฟล์: ไม่พบ ยังเลือกได้ เพราะไฟล์เก่าอาจบันทึกไว้แบบนั้น
        : modal.asset?.condition === 'repair'
          ? condition === 'repair'
          : condition !== 'repair',
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={v => {
          if (!v && !busy) onClose();
        }}
      >
        <DialogContent
          className="dialog-wide"
          onInteractOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => {
            if (
              (modal?.kind === 'create' && (priceInput || newPhoto || Number(qtyInput) > 1)) ||
              (modal?.kind === 'edit' && (newPhoto || removePhoto))
            ) {
              e.preventDefault();
              setCancelConfirmOpen(true);
            }
          }}
        >
          <DialogHeader className="dialog-header-sticky">
            <DialogTitle>{titleMap[modal?.kind || ''] || 'หน้าต่างรายการ'}</DialogTitle>
            <DialogDescription>
              {modal?.kind === 'create'
                ? 'ช่องที่มี * ต้องกรอก ข้อมูลเพิ่มเติมกรอกภายหลังได้'
                : modal?.asset?.name || 'ระบบบันทึกชื่อผู้ทำรายการและเวลาไว้ทุกครั้ง'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="error mx-7 mt-3" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={submit} key={modal?.token} className="flex flex-col flex-1 min-h-0">
            <div className="dialog-scroll-body">
              {modal?.row && (
                <div className={'notice mb-4 ' + (modal.row.issue ? 'warn' : '')}>
                  ชีต {modal.row.sheet} · แถว {modal.row.row}
                  <p>{modal.row.issue || 'ตรวจสถานที่ สาขา สภาพ และยอดเงินก่อนยืนยัน'}</p>
                </div>
              )}

              {/* ส่วนที่ 1: ข้อมูลพื้นฐาน */}
              <div className="form-section">
                <div className="form-section-title">ข้อมูลพื้นฐาน</div>
                <div className="form-grid">
                  <Field
                    label={eachMode ? 'หมายเลขหลัก' : 'หมายเลขครุภัณฑ์'}
                    name="code"
                    value={codeInput}
                    onChange={e => {
                      setCodeInput(e.target.value);
                      // หมายเลขหลักเปลี่ยน → ไล่หมายเลขรายชิ้นใหม่ทั้งหมด (ล้างช่องที่แก้เองไว้)
                      if (Object.keys(pieces.edited).length) setPieces(p => ({ ...p, edited: {} }));
                    }}
                    placeholder="เช่น วค.01-02-0001"
                    required
                    hint={
                      eachMode
                        ? 'ใช้ตั้งต้นหมายเลขของแต่ละชิ้นด้านล่าง และเก็บเป็นหมายเลขของรายการเดิมในประวัติ'
                        : undefined
                    }
                  />
                  <Field
                    label="ชื่อรายการ"
                    name="name"
                    defaultValue={modal?.asset?.name || ''}
                    placeholder="เช่น เครื่องคอมพิวเตอร์แม่ข่าย"
                    autoComplete="off"
                    required
                  />
                  <label>
                    <span>ประเภทครุภัณฑ์ *</span>
                    {/* เลือกจาก 11 ประเภทเท่านั้น พิมพ์ผิดแล้วของจะตกไป "รอจัดหมวด" (ผู้ใช้ขอ 17 ต.ค. 2569)
                        ค่าเดิมที่ไม่อยู่ในรายการ (ข้อมูลเก่า) ยังเลือกค้างไว้ได้ ไม่บังคับเปลี่ยนตอนแก้ช่องอื่น */}
                    <select
                      name="category"
                      value={categoryInput}
                      onChange={e => setCategoryInput(e.target.value)}
                      required
                      className={selectClass}
                    >
                      <option value="" disabled>
                        เลือกประเภทครุภัณฑ์
                      </option>
                      {assetTypes.map(cat => (
                        <option key={cat} value={cat}>
                          {cat} ({assetGroupOfType(cat)})
                        </option>
                      ))}
                      {categoryInput && !(assetTypes as readonly string[]).includes(categoryInput) && (
                        <option value={categoryInput}>{categoryInput} (ค่าเดิม ไม่อยู่ในรายการ)</option>
                      )}
                    </select>
                  </label>
                  {/* หมวด = ชื่อแผ่นงานของประเภท (สำนักงาน คอม ไฟฟ้า ...) คู่กันหนึ่งต่อหนึ่ง เลือกหมวดแล้วประเภทเปลี่ยนตาม (ผู้ใช้ขอ 18 ต.ค. 2569)
                      ไม่ส่งช่องนี้ไปเซิร์ฟเวอร์ เซิร์ฟเวอร์คิดหมวดจากประเภทเองเสมอ */}
                  <label>
                    <span>หมวด *</span>
                    <select
                      value={categoryInput ? assetGroupOfType(categoryInput) : ''}
                      onChange={e => setCategoryInput(assetTypeOf(e.target.value))}
                      className={selectClass}
                    >
                      <option value="" disabled>
                        เลือกหมวด
                      </option>
                      {assetGroups
                        .filter(g => g !== UNGROUPED)
                        .map(g => (
                          <option key={g} value={g}>
                            {g} ({assetTypeOf(g)})
                          </option>
                        ))}
                      {categoryInput && assetGroupOfType(categoryInput) === UNGROUPED && (
                        <option value={UNGROUPED} disabled>
                          {UNGROUPED}
                        </option>
                      )}
                    </select>
                  </label>
                </div>
              </div>

              {/* ส่วนที่ 2: จำนวนและมูลค่า */}
              <div className="form-section">
                <div className="form-section-title">จำนวนและมูลค่า</div>
                <div className="form-grid">
                  <Field
                    label="จำนวน (ชิ้น)"
                    name="quantity"
                    type="number"
                    value={qtyInput}
                    min={1}
                    required
                    readOnly={modal.kind === 'edit'}
                    onChange={handleQtyChange}
                  />
                  <Field
                    label="ราคาต่อหน่วย (บาท)"
                    name="unitPrice"
                    value={priceInput}
                    placeholder="0.00"
                    required
                    readOnly={modal.kind === 'edit'}
                    onChange={handlePriceChange}
                  />
                  <Field
                    label="จำนวนเงินรวม (บาท)"
                    name="totalPrice"
                    value={totalInput}
                    placeholder="0.00"
                    required
                    readOnly={modal.kind === 'edit'}
                    onChange={handleTotalChange}
                    hint={
                      modal.kind === 'edit'
                        ? 'จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ ถ้าต้องแยกจำนวนให้ใช้ปุ่ม “แยกรายการ”'
                        : 'คิดให้อัตโนมัติ (จำนวน × ราคาต่อหน่วย) แก้ได้ถ้าไม่ตรงกับเอกสาร'
                    }
                  />
                </div>

                {/* ของหลายชิ้น: เลือกว่าจะเป็นรายการเดียว (QR เดียว) หรือแยกรายการละชิ้น (QR คนละดวง) ผู้ใช้ขอ 8 พ.ย. 2569 */}
                {choosingQr && (
                  <div className="mt-4" role="radiogroup" aria-label="ติด QR แบบไหน">
                    <span className="block text-sm font-medium text-slate-700 mb-2">ติด QR แบบไหน *</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(
                        [
                          [
                            'group',
                            'QR เดียวทั้งกลุ่ม',
                            `1 รายการ จำนวน ${Number(qtyInput)} ชิ้น เหมาะกับโต๊ะ เก้าอี้ ที่เหมือนกัน`,
                          ],
                          [
                            'each',
                            'QR แยกรายชิ้น',
                            `${Number(qtyInput)} รายการ QR ไม่ซ้ำกัน เหมาะกับคอม เครื่องมือ เครื่องใช้ไฟฟ้า`,
                          ],
                        ] as const
                      ).map(([key, title, detail]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={qrMode === key}
                          onClick={() => setQrMode(key)}
                          className={`flex items-start gap-2.5 text-left p-3 rounded-lg border cursor-pointer transition-all ${qrMode === key ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
                        >
                          {/* วงกลมแบบปุ่มตัวเลือก ให้เห็นชัดว่าเลือกอันไหนอยู่ */}
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${qrMode === key ? 'border-blue-600' : 'border-slate-400'}`}
                          >
                            {qrMode === key && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                          </span>
                          <span>
                            <span
                              className={`block text-sm font-semibold ${qrMode === key ? 'text-blue-900' : 'text-slate-800'}`}
                            >
                              {title}
                            </span>
                            <span className="block text-xs text-slate-600 mt-0.5">{detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {eachMode && (
                      <PiecesEditor base={codeInput} quantity={Number(qtyInput)} value={pieces} onChange={setPieces} />
                    )}
                  </div>
                )}
                {modal.row?.set && Number(qtyInput) > 1 && (
                  <p className="text-xs text-slate-600 mt-3">
                    แถวนี้อยู่ในชุดห้ามแยก จึงบันทึกเป็นรายการเดียว (QR เดียว)
                  </p>
                )}
              </div>

              {/* ส่วนที่ 3: สถานที่และการครอบครอง */}
              <div className="form-section">
                <div className="form-section-title">สถานที่ ผู้รับผิดชอบ และสภาพ</div>
                <div className="form-grid">
                  <Field
                    label="สถานที่ / ห้อง"
                    name="location"
                    defaultValue={modal?.asset?.location || ''}
                    placeholder="เช่น ห้องปฏิบัติการ 402 อาคารวิศวกรรม"
                    required
                    hint={modal?.kind === 'edit' ? 'แก้เฉพาะกรอกผิด ถ้าย้ายของจริงให้ยื่นคำขอโอนย้าย' : undefined}
                  />
                  <label>
                    <span>สาขา/หน่วยงาน *</span>
                    <BranchSelect
                      name="branch"
                      defaultValue={modal?.asset?.branch || modal?.initialBranch || ''}
                      onChange={handleBranchChange}
                    />
                  </label>
                  <Field
                    label="ผู้รับผิดชอบ"
                    name="custodian"
                    defaultValue={modal?.asset?.custodian || ''}
                    placeholder="เช่น ดร.สมชาย ใจดี"
                  />
                  <label>
                    <span>สภาพ</span>
                    <Pick
                      label="สภาพ"
                      name="condition"
                      defaultValue={modal?.asset?.condition || 'normal'}
                      options={conditionOptions}
                    />
                  </label>
                </div>
              </div>

              {/* ส่วนที่ 4: ข้อมูลเพิ่มเติม (ไม่บังคับ) พับไว้ตอนเพิ่มของใหม่ เปิดไว้ตอนแก้ไข · ช่องในส่วนที่พับยังถูกส่งไปพร้อมฟอร์ม */}
              <details className="form-section form-details" open={modal?.kind !== 'create'}>
                <summary className="form-section-title cursor-pointer select-none">
                  ข้อมูลเพิ่มเติม (ไม่บังคับ)
                  <span className="text-xs font-normal text-slate-600 ml-2">
                    ยี่ห้อ Serial วันที่ได้มา อายุใช้งาน หมายเหตุ
                  </span>
                </summary>
                <div className="form-grid">
                  <Field
                    label="ยี่ห้อ / รุ่น"
                    name="brand"
                    defaultValue={modal?.asset?.brand || ''}
                    placeholder="เช่น Dell PowerEdge R750"
                  />
                  {eachMode ? (
                    <p className="text-xs text-slate-600 self-end pb-2">Serial กรอกแยกแต่ละชิ้นในตารางรายชิ้นด้านบน</p>
                  ) : (
                    <Field
                      label="Serial Number"
                      name="serial"
                      defaultValue={modal?.asset?.serial || ''}
                      placeholder="เช่น SN-ABC1234567"
                    />
                  )}
                  <Field
                    label="วันที่ได้มา"
                    name="receivedDate"
                    type="date"
                    value={dateInput}
                    onChange={e => setDateInput(e.target.value)}
                  />
                  <Field
                    label="อายุใช้งาน (ปี)"
                    name="lifeYears"
                    type="number"
                    defaultValue={modal?.asset?.lifeYears || 0}
                    min={0}
                  />
                  <Field
                    label="มูลค่าซาก (บาท)"
                    name="salvage"
                    defaultValue={(modal?.asset?.salvageSatang || 0) / 100}
                    placeholder="1.00"
                    hint="ปกติ 1 บาท หรือตามระเบียบพัสดุ"
                  />
                  <label className="span-2">
                    <span>หมายเหตุของรายการ</span>
                    <Textarea
                      name="notes"
                      defaultValue={modal?.asset?.notes || ''}
                      placeholder="เช่น รับประกัน 3 ปี"
                      rows={2}
                    />
                  </label>
                </div>
              </details>

              {/* ส่วนที่ 5: รูปถ่ายครุภัณฑ์ */}
              <div className="form-section">
                <div className="form-section-title">
                  <ImageIcon size={16} /> รูปถ่ายครุภัณฑ์
                  <span className="text-xs font-normal text-slate-600 ml-2">(ไม่บังคับ)</span>
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />

                <div className="flex flex-col gap-2">
                  {eachMode ? (
                    <p className="text-sm text-slate-600 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      แยกรายชิ้นแล้วแต่ละชิ้นเป็นรายการของตัวเอง เพิ่มรูปได้ภายหลังที่หน้าข้อมูลของแต่ละชิ้น
                    </p>
                  ) : newPhoto ? (
                    <div className="flex items-center gap-4 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                      <img
                        src={newPhoto.url}
                        alt="ตัวอย่างรูปถ่ายใหม่"
                        className="w-20 h-20 object-contain rounded border border-blue-200 bg-white"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {modal?.kind === 'edit' && currentPhotoUrl ? 'รูปใหม่ที่จะนำมาแทนที่' : 'รูปใหม่ที่เลือก'}
                          </span>
                          <span className="text-xs text-slate-500">{(newPhoto.file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate mt-1">{newPhoto.file.name}</p>
                        <p className="text-xs text-blue-700 mt-0.5">บันทึกพร้อมข้อมูลเมื่อกดปุ่มบันทึก</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-white hover:bg-slate-50 text-slate-700"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <Upload size={14} className="mr-1.5" /> เลือกไฟล์อื่น
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            URL.revokeObjectURL(newPhoto.url);
                            setNewPhoto(null);
                          }}
                        >
                          <X size={14} className="mr-1.5" />{' '}
                          {modal?.kind === 'edit' && currentPhotoUrl ? 'ยกเลิก (ใช้รูปเดิม)' : 'ลบรูป'}
                        </Button>
                      </div>
                    </div>
                  ) : removePhoto ? (
                    <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                          <Trash2 size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-red-900">จะลบรูปนี้</p>
                          <p className="text-xs text-red-600 mt-0.5">
                            รูปถ่ายของครุภัณฑ์นี้จะถูกนำออกจากระบบเมื่อกดบันทึก
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-white border-red-200 text-red-700 hover:bg-red-100"
                          onClick={() => setRemovePhoto(false)}
                        >
                          ยกเลิกการลบ (ใช้รูปเดิม)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <Upload size={14} className="mr-1.5" /> อัปโหลดรูปใหม่แทน
                        </Button>
                      </div>
                    </div>
                  ) : currentPhotoUrl && !currentImageFailed ? (
                    <div className="flex items-center gap-4 p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
                      <img
                        src={currentPhotoUrl}
                        alt="รูปถ่ายปัจจุบันของครุภัณฑ์"
                        className="w-20 h-20 object-contain rounded border border-slate-200 bg-slate-50"
                        onError={() => setCurrentImageFailed(true)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            รูปปัจจุบันในทะเบียน
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate mt-1">{modal?.asset?.name}</p>
                        <p className="text-xs text-slate-600 mt-0.5">เปลี่ยนหรือลบรูปได้</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <Upload size={14} className="mr-1.5" /> เปลี่ยนรูป
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRemovePhoto(true)}
                        >
                          <Trash2 size={14} className="mr-1.5" /> ลบรูป
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg text-sm text-slate-600 transition-colors"
                      >
                        <Upload size={17} className="text-slate-500" />
                        <span>
                          {modal?.kind === 'edit'
                            ? 'ยังไม่มีรูป · กดเพื่อเลือกรูป (JPEG, PNG หรือ WebP ไม่เกิน 4 MB)'
                            : 'กดเพื่อแนบรูป (JPEG, PNG หรือ WebP ไม่เกิน 4 MB)'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ส่วนที่ 6: บันทึกประวัติและเหตุผล */}
              <div className="form-section">
                <div className="form-section-title">{modal?.kind === 'edit' ? 'เหตุผลที่แก้ไข' : 'ที่มาของรายการ'}</div>
                <label className="span-2">
                  <span>
                    {modal?.kind === 'edit'
                      ? 'เหตุผลที่แก้ไข *'
                      : modal?.row?.issue
                        ? 'เหตุผลที่ใช้ยอดนี้ *'
                        : 'ที่มาของรายการ (ถ้ามี)'}
                  </span>
                  <Textarea
                    name="reason"
                    required={modal?.kind === 'edit' || !!modal?.row?.issue}
                    placeholder={
                      modal?.kind === 'edit'
                        ? 'เช่น พิมพ์ชื่อผิด หรือใส่สถานที่ผิด · ระบบเก็บไว้ในประวัติ'
                        : 'เช่น จัดซื้อตามสัญญาเลขที่ … หรือรับมอบจากโครงการ …'
                    }
                    rows={2}
                  />
                </label>
                {modal?.kind === 'import' && (
                  <label className="span-2 flex! items-start gap-3 mt-3">
                    <Checkbox name="reviewed" required />
                    <span>ตรวจกับต้นฉบับแล้ว จำนวน มูลค่า สภาพ ถูกต้อง และไม่ซ้ำกับทะเบียน</span>
                  </label>
                )}
              </div>

              {modal?.kind === 'import' && (
                <div className="notice">
                  รหัสช่วง 2 เครื่องที่อ่านได้แน่นอนจะแตกเป็นรายการและ QR คนละรหัสอัตโนมัติ กรณีชุด
                  ให้จัดสรรมูลค่ารวมให้ตรงกับหัวชุด และระบุรายการย่อยที่รวมราคาแล้วในหมายเหตุ
                </div>
              )}
              {modal?.kind === 'edit' && (
                <div className="notice">
                  ใช้แก้ข้อมูลที่กรอกผิด ถ้าย้ายของจริงให้ยื่นคำขอโอนย้าย ถ้าต้องแยกจำนวนให้ใช้ปุ่ม “แยกรายการ”
                </div>
              )}
            </div>

            <div className="dialog-footer-sticky">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    (modal?.kind === 'create' && (priceInput || newPhoto || Number(qtyInput) > 1)) ||
                    (modal?.kind === 'edit' && (newPhoto || removePhoto))
                  ) {
                    setCancelConfirmOpen(true);
                  } else {
                    onClose();
                  }
                }}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? 'กำลังบันทึก…'
                  : modal?.kind === 'create'
                    ? 'เพิ่มครุภัณฑ์'
                    : modal?.kind === 'import'
                      ? 'ยืนยันนำเข้าทะเบียน'
                      : 'บันทึก'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent className="bg-white max-w-md p-6 rounded-xl border border-slate-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">ปิดโดยไม่บันทึก?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 mt-2">
              ข้อมูลที่กรอกในหน้าต่างนี้จะหายไป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2 justify-end">
            <AlertDialogCancel className="rounded-lg border-slate-200">กรอกข้อมูลต่อ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4"
              onClick={() => {
                setCancelConfirmOpen(false);
                onClose();
              }}
            >
              ปิดโดยไม่บันทึก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
