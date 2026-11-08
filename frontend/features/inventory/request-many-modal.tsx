'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Asset, money, satang, MAX_BATCH_ITEMS } from '@/shared/domain';
import { Pick } from '@/frontend/components/common';
import { BranchSelect } from './asset-form-modal';
import { batchCheck, sameValue, type BatchKind } from './request-many';

// ยื่นคำขอหลายรายการพร้อมกัน (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569)
// กรอกประเภท เหตุผล และปลายทางครั้งเดียว ระบบออกคำขอให้รายการละใบ แล้วส่งเข้าสายอนุมัติพร้อมกัน
export default function RequestManyModal({
  assets,
  requests,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  assets: Asset[];
  requests: { assetId: string; status: string }[];
  busy: boolean;
  error: string;
  onSubmit: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<BatchKind>('repair');
  // ปลายทางเติมให้ก่อนเฉพาะค่าที่ทุกรายการเหมือนกัน
  const [location, setLocation] = useState(() => sameValue(assets.map(a => a.location)));
  const [branch, setBranch] = useState(() => sameValue(assets.map(a => a.branch)));
  const [custodian, setCustodian] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');

  const pendingAssetIds = useMemo(
    () => new Set(requests.filter(r => r.status === 'pending').map(r => r.assetId)),
    [requests],
  );
  const { ready, skipped } = useMemo(
    () => batchCheck(assets, kind, pendingAssetIds, { location, branch, custodian }),
    [assets, kind, pendingAssetIds, location, branch, custodian],
  );
  const estimate = useMemo(() => {
    try {
      return satang(cost || 0);
    } catch {
      return null;
    }
  }, [cost]);
  const lots = ready.filter(a => a.quantity > 1).length;
  const tooMany = ready.length > MAX_BATCH_ITEMS;

  function submit() {
    if (!ready.length) return setProblem('ไม่มีรายการที่ยื่นได้');
    if (tooMany) return setProblem(`ยื่นได้ครั้งละไม่เกิน ${MAX_BATCH_ITEMS} รายการ กรุณาแบ่งยื่น`);
    if (kind === 'transfer' && (!location.trim() || !branch)) return setProblem('ระบุสถานที่และสาขาปลายทาง');
    if (kind === 'repair' && estimate === null)
      return setProblem('ประมาณการค่าซ่อม: กรอกจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง');
    if (!reason.trim()) return setProblem('ระบุเหตุผลและความจำเป็น');
    onSubmit({
      action: 'requestMany',
      items: ready.map(a => ({ id: a.id, version: a.version })),
      kind,
      reason: reason.trim(),
      payload:
        kind === 'transfer'
          ? { location: location.trim(), branch, custodian: custodian.trim() }
          : kind === 'repair'
            ? { estimateSatang: estimate ?? 0 }
            : {},
    });
  }

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setProblem('');
    };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="dialog-wide bg-white" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="dialog-header-sticky">
          <DialogTitle>ยื่นคำขอ {assets.length.toLocaleString('th-TH')} รายการพร้อมกัน</DialogTitle>
          <DialogDescription>กรอกครั้งเดียว ระบบออกคำขอให้รายการละใบ แล้วส่งเข้าสายอนุมัติพร้อมกัน</DialogDescription>
        </DialogHeader>
        <div className="dialog-scroll-body space-y-4">
          <Pick
            label="ประเภทคำขอ"
            value={kind}
            onChange={change(v => setKind(v as BatchKind))}
            options={[
              ['repair', 'ส่งซ่อม'],
              ['transfer', 'โอนย้าย (สถานที่ / สาขา / ผู้รับผิดชอบ)'],
              ['disposal', 'จำหน่าย'],
            ]}
          />

          <div className="request-many-list" aria-label="รายการที่จะยื่นคำขอ">
            <p className="request-many-head">
              ยื่นได้ <b>{ready.length.toLocaleString('th-TH')}</b> รายการ
            </p>
            <ul>
              {ready.map(a => (
                <li key={a.id}>
                  <span className="font-mono">{a.code}</span>
                  <span className="truncate">{a.name}</span>
                  {a.quantity > 1 && <span className="request-many-qty">{a.quantity} ชิ้น</span>}
                </li>
              ))}
            </ul>
            {skipped.length > 0 && (
              <>
                <p className="request-many-head is-skip">
                  ข้าม <b>{skipped.length.toLocaleString('th-TH')}</b> รายการ
                </p>
                <ul className="is-skip">
                  {skipped.map(({ asset: a, why }) => (
                    <li key={a.id}>
                      <span className="font-mono">{a.code}</span>
                      <span>{why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {tooMany && (
            <p role="alert" className="error">
              ยื่นได้ครั้งละไม่เกิน {MAX_BATCH_ITEMS} รายการ กรุณาแบ่งยื่น
            </p>
          )}
          {lots > 0 && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
              รายการที่มีหลายชิ้นจะยื่นทั้งรายการ ถ้าต้องการเฉพาะบางชิ้นในรายการนั้น ให้ยื่นทีละรายการ
            </p>
          )}

          <div className="form-grid">
            {kind === 'transfer' && (
              <>
                <label>
                  <span>สถานที่ใหม่ (ปลายทาง) *</span>
                  <Input
                    value={location}
                    onChange={e => change(setLocation)(e.target.value)}
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
                <label>
                  <span>สาขาใหม่ (ปลายทาง) *</span>
                  <BranchSelect name="branch" defaultValue={branch} onChange={e => change(setBranch)(e.target.value)} />
                </label>
                <label className="span-2">
                  <span>ผู้รับผิดชอบใหม่ (ถ้ามี)</span>
                  <Input
                    value={custodian}
                    onChange={e => change(setCustodian)(e.target.value)}
                    placeholder="เว้นว่างถ้าไม่เปลี่ยน"
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {kind === 'repair' && (
              <label className="span-2">
                <span>ประมาณการค่าซ่อมต่อรายการ (บาท)</span>
                <Input
                  value={cost}
                  onChange={e => change(setCost)(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={busy}
                />
                {estimate !== null && estimate > 0 && ready.length > 1 && (
                  <small className="text-xs text-slate-600 mt-1 block">
                    รวม {ready.length.toLocaleString('th-TH')} รายการ ≈ {money(estimate * ready.length)} บาท
                  </small>
                )}
              </label>
            )}
            {kind === 'disposal' && (
              <div className="span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg p-2.5">
                เมื่ออนุมัติครบทุกขั้น รายการเหล่านี้จะย้ายไปหมวด “จำหน่ายแล้ว” และไม่นับในทะเบียนที่ใช้อยู่
              </div>
            )}
            <label className="span-2">
              <span>เหตุผลและความจำเป็น (ใช้กับทุกรายการ) *</span>
              <Textarea
                value={reason}
                onChange={e => change(setReason)(e.target.value)}
                placeholder="เช่น ขาเก้าอี้หัก ใช้งานไม่ได้"
                rows={3}
                disabled={busy}
              />
            </label>
          </div>
          {(problem || error) && (
            <p role="alert" className="error">
              {problem || error}
            </p>
          )}
        </div>
        <div className="dialog-footer-sticky">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            ปิด
          </Button>
          <Button type="button" onClick={submit} disabled={busy || !ready.length || tooMany}>
            {busy ? 'กำลังบันทึก…' : `ยื่นคำขอ ${ready.length.toLocaleString('th-TH')} รายการ`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
