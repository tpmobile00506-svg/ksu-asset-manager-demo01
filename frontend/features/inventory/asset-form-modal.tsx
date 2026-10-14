'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { Upload, ImageIcon, Trash2, X } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Asset, conditions, satang, assetTypes, assetGroups, standardBranches } from '@/shared/domain';
import {
  Any,
  api,
  Pick,
  sessionFetch,
  readApiResponse,
  getSessionSignal
} from '@/frontend/components/common';
import { WorkspaceData } from '@/frontend/types/models';

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
  list
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
  Object.entries(object).sort(([a], [b]) =>
    a === key ? -1 : b === key ? 1 : 0
  ) as [string, string][];

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

export async function uploadCreatedAssetPhoto(
  assetId: string,
  file: File,
  signal: AbortSignal,
  expectedVersion = ''
) {
  const body = new FormData();
  body.set('assetId', assetId);
  body.set('expectedVersion', expectedVersion);
  body.set('file', file);
  const result = await readApiResponse(
    await sessionFetch('/api/asset-image', { method: 'POST', body, signal })
  );
  signal.throwIfAborted();
  if (result.ok !== true || typeof result.imageVersion !== 'string') {
    throw new Error('เซิร์ฟเวอร์ส่งผลบันทึกรูปไม่ครบ กรุณาเปิดรายละเอียดเพื่อตรวจสอบ');
  }
  return result;
}

export async function deleteAssetPhoto(
  assetId: string,
  expectedVersion: string,
  signal: AbortSignal
) {
  const result = await readApiResponse(
    await sessionFetch('/api/asset-image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, expectedVersion }),
      signal
    })
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
  setError
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
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal && ['create', 'edit', 'import'].includes(modal.kind)) {
      const b = modal.asset?.branch || 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)';
      const c = modal.asset?.category || '';
      setBranchInput(b);
      setCategoryInput(c);

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

  const handleBranchChange = (e: ChangeEvent<HTMLInputElement>) => {
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
        salvageSatang: satang(f.salvage || 0)
      };

      const res = await write({
        action: modal.kind,
        asset: a,
        id: modal.asset?.id,
        version: modal.asset?.version,
        sourceId: modal.sourceId,
        sourceRow: modal.row?.key,
        reviewed: f.reviewed === 'on',
        reason: f.reason || ''
      });

      const targetAssetId = modal.kind === 'edit' ? modal.asset?.id : res?.id;
      const currentVersion = modal.asset?.imageVersion || '';

      if (res && targetAssetId) {
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
              imageSaved
                ? 'บันทึกรูปแล้ว แต่รีเฟรชทะเบียนไม่สำเร็จ'
                : 'บันทึกข้อมูลครุภัณฑ์แล้ว แต่แนบรูปไม่สำเร็จ',
              {
                description: `${
                  photoErr instanceof Error ? photoErr.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'
                } เปิดรายละเอียดเพื่อตรวจสอบหรือเพิ่มรูปอีกครั้ง ไม่ต้องสร้างรายการใหม่`,
                duration: Infinity,
                action: {
                  label: 'เปิดรายละเอียด',
                  onClick: async () => {
                    if (signal.aborted) return;
                    try {
                      const current = await api();
                      signal.throwIfAborted();
                      const saved = current.assets.find(
                        (asset: Asset) => asset.id === targetAssetId
                      );
                      if (!saved) throw new Error('ไม่พบรายการที่บันทึก กรุณารีเฟรชทะเบียน');
                      setSelected(saved);
                    } catch (cause) {
                      if (!signal.aborted)
                        toast.error(
                          cause instanceof Error
                            ? cause.message
                            : 'เปิดรายละเอียดไม่สำเร็จ กรุณาค้นหารายการในทะเบียน'
                        );
                    }
                  }
                },
                cancel: { label: 'ปิด', onClick: () => {} }
              }
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
              description:
                photoErr instanceof Error
                  ? photoErr.message
                  : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'
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
    import: 'ตรวจสอบและยืนยันนำเข้า'
  };

  const currentPhotoUrl =
    modal?.asset?.imageUrl ||
    (modal?.asset?.id && modal?.asset?.imageVersion
      ? `/api/asset-image?asset=${encodeURIComponent(modal.asset.id)}&v=${encodeURIComponent(modal.asset.imageVersion)}`
       : null);

  const branchOptions = Array.from(new Set([
    modal.asset?.branch,
    ...data.assets.map((asset: Asset) => asset.branch),
    ...standardBranches
  ].filter((branch): branch is string => typeof branch === 'string' && branch.length > 0)));
  const conditionOptions = prioritized(conditions, modal.asset?.condition || 'normal')
    .filter(([condition]) => modal.kind !== 'edit'
      ? condition !== 'repair'   // เพิ่ม/นำเข้า: ห้ามเลือก "กำลังซ่อม" (ต้องผ่านคำขอซ่อม)
      : (modal.asset?.condition === 'repair'
        ? condition === 'repair'
        : condition !== 'repair'));

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
                ? 'กรอกข้อมูลเพื่อบันทึกครุภัณฑ์ใหม่เข้าสู่ทะเบียนกลาง'
                : modal?.asset?.name || 'ระบบบันทึกชื่อผู้ดำเนินการและเวลาที่ทำรายการเสมอ'}
            </DialogDescription>
          </DialogHeader>

          {error && <div className="error mx-7 mt-3" role="alert">{error}</div>}

          <form onSubmit={submit} key={modal?.token} className="flex flex-col flex-1 min-h-0">
            <div className="dialog-scroll-body">
              {modal?.row && (
                <div className={'notice mb-4 ' + (modal.row.issue ? 'warn' : '')}>
                  ชีต {modal.row.sheet} · แถว {modal.row.row}
                  <p>{modal.row.issue || 'ตรวจสอบสถานที่ สาขา สถานะ และยอดเงินก่อนยืนยัน'}</p>
                </div>
              )}

              {/* ส่วนที่ 1: ข้อมูลพื้นฐาน */}
              <div className="form-section">
                <div className="form-section-title">ข้อมูลพื้นฐาน</div>
                <div className="form-grid">
                  <Field
                    label="หมายเลขครุภัณฑ์"
                    name="code"
                    defaultValue={modal?.asset?.code || ''}
                    placeholder="เช่น วค.01-02-0001"
                    required
                  />
                  <Field
                    label="ชื่อรายการครุภัณฑ์"
                    name="name"
                    defaultValue={modal?.asset?.name || ''}
                    placeholder="เช่น เครื่องคอมพิวเตอร์แม่ข่าย"
                    required
                  />
                  <label>
                    <span>ประเภทครุภัณฑ์ (สำนักงาน) *</span>
                    <Input
                      name="category"
                      value={categoryInput}
                      onChange={e => setCategoryInput(e.target.value)}
                      list="asset-category-options"
                      placeholder="เช่น ครุภัณฑ์คอมพิวเตอร์"
                      required
                    />
                    <datalist id="asset-category-options">
                      {assetTypes.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </label>
                  <Field
                    label="หมวด (กลุ่มต่างๆ)"
                    name="groupName"
                    list="asset-group-options"
                    defaultValue={modal?.asset?.groupName || ''}
                    placeholder="เว้นว่าง = จัดจากชื่อรายการ"
                  />
                  <datalist id="asset-group-options">
                    {assetGroups.map(g => <option key={g} value={g} />)}
                  </datalist>
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
                    hint={modal.kind === 'edit'
                      ? 'จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ หากต้องการแยกจำนวนให้ใช้แบ่งล็อต'
                      : 'คำนวณอัตโนมัติ (จำนวน × ราคาต่อหน่วย) สามารถปรับแก้ได้'}
                  />
                </div>
              </div>

              {/* ส่วนที่ 3: สถานที่และการครอบครอง */}
              <div className="form-section">
                <div className="form-section-title">สถานที่และการครอบครอง</div>
                <div className="form-grid">
                  <Field
                    label="สถานที่ตั้ง / ห้อง"
                    name="location"
                    defaultValue={modal?.asset?.location || ''}
                    placeholder="เช่น ห้องปฏิบัติการ 402 อาคารวิศวกรรม"
                    required
                  />
                  <label>
                    <span>สาขาวิชา / หน่วยงาน *</span>
                    <Input
                      name="branch"
                      defaultValue={modal?.asset?.branch || 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)'}
                      onChange={handleBranchChange}
                      list="asset-branch-options"
                      placeholder="เลือกจากรายการหรือพิมพ์ชื่อสาขา"
                      required
                    />
                    <datalist id="asset-branch-options">
                      {branchOptions.map(branch => (
                        <option key={branch} value={branch} />
                      ))}
                    </datalist>
                  </label>
                  <Field
                    label="ผู้รับผิดชอบ / ผู้ดูแล"
                    name="custodian"
                    defaultValue={modal?.asset?.custodian || ''}
                    placeholder="เช่น ดร.สมชาย ใจดี"
                  />
                </div>
              </div>

              {/* ส่วนที่ 4: คุณลักษณะและอายุใช้งาน */}
              <div className="form-section">
                <div className="form-section-title">คุณลักษณะและอายุใช้งาน</div>
                <div className="form-grid">
                  <Field
                    label="ยี่ห้อ / รุ่น"
                    name="brand"
                    defaultValue={modal?.asset?.brand || ''}
                    placeholder="เช่น Dell PowerEdge R750"
                  />
                  <Field
                    label="หมายเลขเครื่อง (Serial Number)"
                    name="serial"
                    defaultValue={modal?.asset?.serial || ''}
                    placeholder="เช่น SN-ABC1234567"
                  />
                  <Field
                    label="วันที่ตรวจรับเข้าคลัง"
                    name="receivedDate"
                    type="date"
                    value={dateInput}
                    onChange={e => setDateInput(e.target.value)}
                  />
                  <label>
                    <span>สภาพความพร้อมใช้งาน</span>
                    <Pick
                      label="สภาพความพร้อมใช้งาน"
                      name="condition"
                      defaultValue={modal?.asset?.condition || 'normal'}
                      options={conditionOptions}
                    />
                  </label>
                  <Field
                    label="อายุใช้งานมาตรฐาน (ปี)"
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
                    hint="ปกติกำหนด 1 บาท หรือตามระเบียบพัสดุ"
                  />
                  <label className="span-2">
                    <span>หมายเหตุ / บันทึกประวัติการใช้งาน</span>
                    <Textarea
                      name="notes"
                      defaultValue={modal?.asset?.notes || ''}
                      placeholder="เช่น รับประกัน 3 ปี ซ่อมบำรุง onsite หรือข้อความเพิ่มเติม"
                      rows={2}
                    />
                  </label>
                </div>
              </div>

              {/* ส่วนที่ 5: รูปถ่ายครุภัณฑ์ */}
              <div className="form-section">
                <div className="form-section-title">
                  <ImageIcon size={16} /> รูปถ่ายครุภัณฑ์
                  <span className="text-xs font-normal text-slate-500 ml-2">
                    {modal?.kind === 'edit'
                      ? '(แสดงรูปปัจจุบัน สามารถคลิกเปลี่ยนรูปใหม่หรือลบรูปได้)'
                      : '(แนบรูปได้ทันที)'}
                  </span>
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />

                <div className="flex flex-col gap-2">
                  {newPhoto ? (
                    <div className="flex items-center gap-4 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                      <img
                        src={newPhoto.url}
                        alt="ตัวอย่างรูปถ่ายใหม่"
                        className="w-20 h-20 object-contain rounded border border-blue-200 bg-white"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {modal?.kind === 'edit' && currentPhotoUrl
                              ? 'รูปใหม่ที่จะนำมาแทนที่'
                              : 'รูปใหม่ที่เลือก'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {(newPhoto.file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate mt-1">
                          {newPhoto.file.name}
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          พร้อมบันทึกเข้าระบบเมื่อกดปุ่มบันทึก
                        </p>
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
                          {modal?.kind === 'edit' && currentPhotoUrl
                            ? 'ยกเลิก (ใช้รูปเดิม)'
                            : 'ลบรูป'}
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
                          <p className="text-sm font-medium text-red-900">ตั้งค่าลบรูปปัจจุบัน</p>
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
                        <p className="text-sm font-medium text-slate-800 truncate mt-1">
                          {modal?.asset?.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          คุณสามารถเลือกเปลี่ยนรูปใหม่ หรือลบรูปภาพนี้ได้
                        </p>
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
                        <Upload size={17} className="text-slate-400" />
                        <span>
                          {modal?.kind === 'edit'
                            ? 'ยังไม่มีรูปครุภัณฑ์ · คลิกเพื่ออัปโหลดรูปถ่าย (JPEG, PNG หรือ WebP ขนาดไม่เกิน 4 MB)'
                            : 'คลิกเพื่อแนบรูปถ่ายครุภัณฑ์ (JPEG, PNG หรือ WebP ขนาดไม่เกิน 4 MB)'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ส่วนที่ 6: บันทึกประวัติและเหตุผล */}
              <div className="form-section">
                <div className="form-section-title">
                  {modal?.kind === 'create' ? 'บันทึกเพิ่มเติม' : 'บันทึกประวัติการเปลี่ยนแปลง'}
                </div>
                <label className="span-2">
                  <span>
                    {modal?.kind === 'create'
                      ? 'หมายเหตุการรับเข้า / ที่มาของรายการ (ถ้ามี)'
                      : 'เหตุผลการแก้ไขข้อมูล *'}
                  </span>
                  <Textarea
                    name="reason"
                    required={modal?.kind === 'edit' || !!modal?.row?.issue}
                    placeholder={
                      modal?.kind === 'create'
                        ? 'เช่น จัดซื้อตามสัญญาเลขที่... หรือ รับมอบจากโครงการ... (ไม่บังคับ)'
                        : 'ระบุเหตุผลการปรับปรุงข้อมูล เพื่อบันทึกประวัติการดำเนินงาน (Audit Trail)'
                    }
                    rows={2}
                  />
                </label>
                {modal?.kind === 'import' && (
                  <label className="span-2 flex! items-start gap-3 mt-3">
                    <Checkbox name="reviewed" required />
                    <span>ตรวจสอบกับต้นฉบับแล้ว ยืนยันจำนวน มูลค่า สถานะ และไม่ซ้ำกับทะเบียน</span>
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
                  สามารถแก้ไขรายละเอียดครุภัณฑ์ สถานที่/ห้อง และบันทึกประวัติเพิ่มเติมได้ โดยระบุเหตุผลเพื่อเก็บบันทึกประวัติ
                  (Audit Log) (กรณีต้องการแยกจำนวน ให้ใช้ปุ่ม "แบ่งล็อต")
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
                  ? 'บันทึกข้อมูลครุภัณฑ์'
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
            <AlertDialogTitle className="text-lg font-bold text-slate-900">
              ต้องการยกเลิกการกรอกข้อมูลใช่หรือไม่?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 mt-2">
              ข้อมูลที่คุณกรอกไว้ในหน้าต่างนี้จะสูญหายและไม่ถูกบันทึกเข้าระบบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-900 my-2">
            หากกดยืนยัน ข้อมูลที่กรอกทั้งหมดจะถูกล้างและปิดหน้าต่างลง
          </div>
          <AlertDialogFooter className="mt-4 flex gap-2 justify-end">
            <AlertDialogCancel className="rounded-lg border-slate-200">
              กรอกข้อมูลต่อ
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4"
              onClick={() => {
                setCancelConfirmOpen(false);
                onClose();
              }}
            >
              ยืนยันยกเลิก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
