'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Pencil,
  ArrowLeftRight,
  Printer,
  Minus,
  Plus,
  Camera,
  Scissors,
  Wrench,
  History,
  QrCode,
  CheckCircle2,
  Calendar,
  FolderOpen,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge, ConditionBadge, Activity, Pick, api, baht } from '@/frontend/components/common';
import {
  Asset,
  conditions,
  groupFor,
  setRoles,
  officeBranches,
  thaiDateOnly,
  thaiDateTime,
  type SetRole,
} from '@/shared/domain';
import type { RepairRecord } from '@/shared/models';
import {
  MAX_STICKERS,
  isStickerSize,
  stickerCopies,
  stickerSizes,
  type StickerSize,
} from '@/shared/qr-sticker-document';
import AssetPhoto from './asset-photo';
import StickerPreview from './sticker-preview';
import { printStickers, savedStickerSize, saveStickerSize } from './qr-sticker';

interface AssetDetailViewProps {
  asset: Asset;
  // ป้าย "รออนุมัติ…" ถ้ารายการนี้มีคำขอค้างอยู่ (awaitingApprovalByAsset)
  awaiting?: { label: string; detail: string };
  onBack: () => void;
  editable: boolean;
  onEdit: () => void;
  onRequest: () => void;
  onSplit?: () => void;
  // แยกรายการกลุ่มเป็นรายชิ้น (QR คนละดวง)
  onSplitEach?: () => void;
  onRepairComplete?: () => void;
  // ยกเลิกรายการที่บันทึกผิด (หมวด "ข้อมูลผิดพลาด")
  onVoid?: () => void;
  // กู้คืนรายการที่ยกเลิกกลับเข้าทะเบียน
  onRestore?: () => void;
  onSelectAsset?: (a: Asset) => void;
  onPhotoChanged: () => Promise<void>;
  rounds?: any[];
  onCheckRound?: (roundId: string) => void;
  funds?: Array<{ id: string; name: string }>;
}

export default function AssetDetailView({
  asset,
  awaiting,
  onBack,
  editable,
  onEdit,
  onRequest,
  onSplit,
  onSplitEach,
  onRepairComplete,
  onVoid,
  onRestore,
  onSelectAsset,
  onPhotoChanged,
  rounds = [],
  onCheckRound,
  funds = [],
}: AssetDetailViewProps) {
  // ทุนที่ยืนยันแล้ว (fundId) หรือทุนที่แนะนำจากไฟล์ต้นฉบับ (fundHintId) แสดงเป็นแถบเต็มความกว้าง ชื่อยาวไม่ถูกตัด
  const hintName = !asset.fundId && asset.fundHintId ? funds.find(f => f.id === asset.fundHintId)?.name : undefined;
  const fundLabel = asset.fundName || hintName;
  // ช่องเดียวในฐานข้อมูล แสดงแยก: ของสาขาวิชา → หน่วยงาน = คณะ, ของหน่วยงาน → สาขาวิชา = —
  const isOffice = (officeBranches as readonly string[]).includes(asset.branch);
  const [history, setHistory] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // สติกเกอร์ QR: ขนาดม้วนใช้ค่าที่เลือกล่าสุด (จำไว้ในเบราว์เซอร์) · จำนวนดวงเริ่มที่ 1 ทุกครั้งที่เปิดรายการใหม่
  const [stickerSize, setStickerSize] = useState<StickerSize>(savedStickerSize);
  const [stickerCount, setStickerCount] = useState<number | string>(1);
  useEffect(() => {
    setStickerCount(1);
  }, [asset.id]);

  // ดึงประวัติไทม์ไลน์และรายการที่แยกย่อย (History & Children)
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    api('?view=history&asset=' + encodeURIComponent(asset.id))
      .then(res => {
        if (!cancelled) {
          setHistory(res);
          setLoadingHistory(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setHistory({ error: e.message || 'โหลดประวัติไม่สำเร็จ', events: [], children: [] });
          setLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.version]);

  const changeStickerSize = (value: string) => {
    if (!isStickerSize(value)) return;
    setStickerSize(value);
    saveStickerSize(value);
  };
  const handlePrintSticker = () => {
    void printStickers([{ asset, copies: stickerCopies(stickerCount) }], stickerSize);
  };
  // รายการที่แยกแล้ว/จำหน่ายแล้ว/ยกเลิกแล้วเป็นประวัติ ไม่ต้องติดสติกเกอร์ (ติดของชิ้นที่ใช้อยู่แทน)
  const printable = asset.lifecycle === 'active';

  const openRounds = rounds.filter(r => r.status === 'open');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Back button and page heading */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563eb] hover:text-[#1d4ed8] hover:underline cursor-pointer mb-2"
        >
          <ArrowLeft size={14} /> กลับไปทะเบียน
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight break-words">{asset.name}</h1>
            <p className="text-slate-600 text-xs sm:text-sm mt-1 break-all">
              <span className="font-mono font-semibold text-blue-700">{asset.code}</span> · เพิ่มเข้าระบบ{' '}
              {asset.createdAt ? thaiDateTime(asset.createdAt, false) : '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && asset.lifecycle === 'voided' && onRestore && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRestore}
                className="h-9 px-3 text-xs font-semibold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
              >
                <RotateCcw size={13} className="mr-1.5" /> กู้คืนรายการ
              </Button>
            )}
            {editable && asset.lifecycle === 'active' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="h-9 px-3 text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
                >
                  <Pencil size={13} className="mr-1.5" /> แก้ไขข้อมูล
                </Button>
                {asset.quantity > 1 && onSplit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSplit}
                    className="h-9 px-3 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    <Scissors size={13} className="mr-1.5" /> แยกรายการ ({asset.quantity})
                  </Button>
                )}
                {asset.quantity > 1 && !asset.setId && asset.condition !== 'repair' && onSplitEach && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSplitEach}
                    className="h-9 px-3 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    <QrCode size={13} className="mr-1.5" /> แยกเป็นรายชิ้น
                  </Button>
                )}
                {asset.condition === 'repair' && onRepairComplete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRepairComplete}
                    className="h-9 px-3 text-xs font-semibold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                  >
                    <Wrench size={13} className="mr-1.5" /> บันทึกซ่อมเสร็จ
                  </Button>
                )}
                {onVoid && !asset.parentId && !asset.setId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onVoid}
                    className="h-9 px-3 text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 cursor-pointer"
                  >
                    <Ban size={13} className="mr-1.5" /> ยกเลิกรายการ (บันทึกผิด)
                  </Button>
                )}
              </>
            )}
            {/* ยื่นคำขอได้เฉพาะเจ้าหน้าที่/ผู้ดูแลระบบ และรายการที่ยังใช้อยู่ (เซิร์ฟเวอร์ตรวจซ้ำ) */}
            {editable && asset.lifecycle === 'active' && (
              <Button
                size="sm"
                onClick={onRequest}
                className="h-9 px-3.5 text-xs font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white cursor-pointer shadow-sm"
              >
                <ArrowLeftRight size={14} className="mr-1.5" /> ยื่นคำขอ
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2 คอลัมน์: จอกว้าง ข้อมูลซ้าย รูปและป้ายขวา · มือถือ ข้อมูลขึ้นก่อน รูปและป้ายต่อท้าย (เดิมรูปขึ้นก่อน ข้อมูลเริ่มที่ 1,186px) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Details & Activity Timeline (Desktop: Order 1, Mobile: Order 2) */}
        <div className="lg:col-span-8 order-1 space-y-6">
          {/* Main Specifications Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a]">ข้อมูลครุภัณฑ์</h2>
              <div className="flex items-center gap-1.5">
                <ConditionBadge condition={asset.condition} awaiting={awaiting} />
                {asset.lifecycle !== 'active' && <Badge value={asset.lifecycle} />}
              </div>
            </div>

            {fundLabel && (
              <div
                className={`rounded-lg border px-4 py-3 flex gap-3 items-start ${asset.fundName ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 border-dashed'}`}
              >
                <FolderOpen
                  size={20}
                  className={asset.fundName ? 'text-blue-700 mt-0.5 shrink-0' : 'text-slate-500 mt-0.5 shrink-0'}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className={`text-xs font-bold ${asset.fundName ? 'text-blue-700' : 'text-slate-600'}`}>
                    ทุน / โครงการ · {asset.fundName ? 'ยืนยันแล้ว' : 'แนะนำจากไฟล์ต้นฉบับ (ยังไม่ยืนยัน)'}
                  </div>
                  <div
                    className={`text-sm leading-relaxed break-words ${asset.fundName ? 'text-blue-900' : 'text-slate-700'}`}
                  >
                    {fundLabel}
                  </div>
                </div>
              </div>
            )}

            {/* Row 1: Code & Serial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">หมายเลขครุภัณฑ์</label>
                <div className="relative">
                  <Input
                    value={asset.code}
                    readOnly
                    className="font-mono text-sm font-bold text-blue-700 bg-slate-50 border-slate-200 select-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Serial Number</label>
                <Input
                  value={asset.serial || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Row 2: Asset Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อรายการ</label>
              <Input
                value={asset.name}
                readOnly
                className="text-sm font-semibold bg-white border-slate-200 text-slate-900"
              />
            </div>

            {/* Row 3: Category & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ประเภทครุภัณฑ์</label>
                <Input
                  value={asset.category || 'ทั่วไป'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">หมวด</label>
                <Input value={groupFor(asset)} readOnly className="text-sm bg-white border-slate-200 text-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">สาขาวิชา</label>
                <Input
                  value={isOffice ? '— (ไม่ใช่ของสาขาวิชา)' : asset.branch || '—'}
                  readOnly
                  className={`text-sm bg-white border-slate-200 ${isOffice ? 'text-slate-600' : 'text-slate-800'}`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">หน่วยงานที่รับผิดชอบ</label>
                <Input
                  value={isOffice ? asset.branch : 'คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Row 4: Location & Custodian */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">สถานที่ / ห้อง</label>
                <Input
                  value={asset.location || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ผู้รับผิดชอบ</label>
                <Input
                  value={asset.custodian || '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              {asset.setId && (
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชุด (ห้ามแยก — โอนย้าย/จำหน่ายต้องไปทั้งชุด)
                  </label>
                  <Input
                    value={`${setRoles[asset.setRole as SetRole] ?? 'รายการในชุด'} · ${asset.setName ?? ''}`}
                    readOnly
                    className="text-sm bg-amber-50 border-amber-200 text-slate-800"
                  />
                </div>
              )}
            </div>

            {/* Row 5: Acquisition Date & Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">วันที่ได้มา</label>
                <Input
                  value={asset.receivedDate ? thaiDateOnly(asset.receivedDate) : '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ราคาต่อหน่วย</label>
                <Input
                  value={baht(asset.unitSatang)}
                  readOnly
                  className="text-sm font-semibold bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">มูลค่ารวม ({asset.quantity} ชิ้น)</label>
                <Input
                  value={baht(asset.totalSatang)}
                  readOnly
                  className="text-sm font-bold bg-slate-50 border-slate-200 text-blue-700"
                />
              </div>
            </div>

            {/* Row 6: Life Years & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">อายุใช้งาน</label>
                <Input
                  value={asset.lifeYears ? `${asset.lifeYears} ปี` : '—'}
                  readOnly
                  className="text-sm bg-white border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">สภาพ</label>
                <Input
                  value={
                    awaiting
                      ? `${awaiting.label} · ${awaiting.detail} (สภาพตอนนี้: ${conditions[asset.condition as keyof typeof conditions] || asset.condition})`
                      : conditions[asset.condition as keyof typeof conditions] || asset.condition
                  }
                  readOnly
                  className={`text-sm font-medium bg-white ${awaiting ? 'border-orange-300 text-orange-700' : 'border-slate-200 text-slate-800'}`}
                />
              </div>
            </div>

            {/* Row 7: Notes & Specification */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">หมายเหตุ</label>
              <Textarea
                value={asset.notes || '—'}
                readOnly
                rows={3}
                className="text-sm bg-white border-slate-200 text-slate-700 resize-none"
              />
            </div>
          </div>

          {/* Open Stocktake Rounds Notice & Action */}
          {editable && asset.lifecycle === 'active' && openRounds.length > 0 && onCheckRound && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-sm text-blue-900 block font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-blue-600" />
                  รอบตรวจนับที่เปิดอยู่สำหรับรายการนี้
                </strong>
                <p className="text-xs text-blue-800 mt-0.5">บันทึกผลตรวจนับของรายการนี้เข้ารอบที่เปิดอยู่ได้เลย</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {openRounds.map(r => (
                  <Button
                    key={r.id}
                    size="sm"
                    onClick={() => onCheckRound(r.id)}
                    className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                  >
                    ตรวจรอบ {r.year || r.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-items / Split Children */}
          {history?.children && history.children.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Scissors size={14} className="text-amber-700" />
                รายการที่แยกออกมาจากรายการนี้
              </h3>
              <div className="space-y-1.5">
                {history.children.map((child: Asset) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelectAsset && onSelectAsset(child)}
                    className="w-full text-left p-2.5 rounded-lg bg-white border border-amber-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-700 mr-2">{child.code}</span>
                      <span className="text-slate-800 font-medium">{child.name}</span>
                    </div>
                    <span className="text-slate-600 font-semibold">
                      {child.quantity} ชิ้น · {baht(child.totalSatang)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ประวัติการซ่อมบำรุง (ผู้ซ่อม ค่าใช้จ่าย ผลการซ่อม) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <Wrench size={17} className="text-orange-600" />
                ประวัติการซ่อม
              </h2>
              <span className="text-xs text-slate-600">
                {history?.repairs?.length || 0} ครั้ง
                {history?.repairs?.length
                  ? ` · รวม ${baht(history.repairs.reduce((sum: number, r: RepairRecord) => sum + r.costSatang, 0))}`
                  : ''}
              </span>
            </div>
            {history?.repairs && history.repairs.length > 0 ? (
              <div className="space-y-2">
                {history.repairs.map((r: RepairRecord) => (
                  <div key={r.id} className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">ผู้ซ่อม: {r.repairedBy || '—'}</span>
                      <span className="font-bold text-orange-700">{baht(r.costSatang)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.result || '—'}</p>
                    <p className="mt-1 text-[11px] text-slate-600">{thaiDateTime(r.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-600">ยังไม่มีประวัติการซ่อม</div>
            )}
          </div>

          {/* Activity Timeline Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <History size={17} className="text-blue-600" />
                ประวัติการทำรายการ
              </h2>
              <span className="text-xs text-slate-600">{history?.events?.length || 0} เหตุการณ์</span>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-600 animate-pulse">กำลังโหลดประวัติ…</div>
            ) : history?.events && history.events.length > 0 ? (
              <div className="space-y-3">
                {history.events.map((e: any) => (
                  <Activity key={e.id} event={e} />
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-600">ยังไม่มีประวัติของรายการนี้</div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Assets (Desktop: Order 2, Mobile: Order 1) */}
        <div className="lg:col-span-4 order-2 space-y-6">
          {/* Card 1: Asset Photo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                <Camera size={15} className="text-blue-600" /> รูปถ่ายครุภัณฑ์
              </h2>
            </div>

            <div className="w-full">
              <AssetPhoto
                assetId={asset.id}
                name={asset.name}
                imageVersion={asset.imageVersion}
                editable={editable}
                onChanged={onPhotoChanged}
              />
            </div>
          </div>

          {/* Card 2: สติกเกอร์ QR ตามสัดส่วนจริงของม้วนที่เลือก (หน้าตาเดียวกับที่พิมพ์ออกมา) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0f172a] flex items-center gap-1.5 shrink-0">
                <QrCode size={15} className="text-blue-600" /> สติกเกอร์ QR
              </h2>
              <Pick
                label="ขนาดสติกเกอร์"
                value={stickerSize}
                onChange={changeStickerSize}
                options={Object.entries(stickerSizes).map(
                  ([key, s]) => [key, `${s.w} × ${s.h} มม.`] as [string, string],
                )}
              />
            </div>

            <div className="sticker-stage">
              <StickerPreview asset={asset} size={stickerSize} maxWidth={260} maxHeight={170} />
            </div>

            {printable && asset.quantity > 1 && (
              <p className="text-xs text-amber-700 leading-relaxed">
                รายการนี้มี {asset.quantity.toLocaleString('th-TH')} ชิ้นใช้ QR เดียวกัน
                {onSplitEach ? ' · ถ้าต้องการ QR คนละดวง กดปุ่ม "แยกเป็นรายชิ้น" ด้านบน' : ''}
              </p>
            )}

            {printable ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-600">จำนวน</span>
                <span className="sticker-copies">
                  <button
                    type="button"
                    aria-label="ลดจำนวนดวง"
                    onClick={() => setStickerCount(stickerCopies(stickerCopies(stickerCount) - 1))}
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_STICKERS}
                    aria-label="จำนวนดวงที่จะพิมพ์"
                    value={stickerCount}
                    onChange={e => setStickerCount(e.target.value)}
                    onBlur={() => setStickerCount(stickerCopies(stickerCount))}
                  />
                  <button
                    type="button"
                    aria-label="เพิ่มจำนวนดวง"
                    onClick={() => setStickerCount(stickerCopies(stickerCopies(stickerCount) + 1))}
                  >
                    <Plus size={13} />
                  </button>
                </span>
                <span className="text-xs text-slate-600">ดวง</span>
                <Button
                  onClick={handlePrintSticker}
                  className="ml-auto h-9 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  <Printer size={13} className="mr-1.5" /> พิมพ์สติกเกอร์
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-600">รายการนี้ไม่อยู่ในทะเบียนที่ใช้อยู่ จึงไม่มีปุ่มพิมพ์สติกเกอร์</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
