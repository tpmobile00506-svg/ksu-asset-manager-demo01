'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  History,
  Search,
  Filter,
  Upload,
  Pencil,
  ArrowLeftRight,
  Wrench,
  ShieldCheck,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  X,
  Clock,
  Eye,
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Empty, Pager, api } from '@/frontend/components/common';
import { Asset, money, conditions } from '@/shared/domain';
import type { WorkspaceData, AuditRecord } from '@/shared/models';
import { toast } from 'sonner';

type TabKey = 'all' | 'stocktake' | 'transfer' | 'repair' | 'dispose' | 'edit' | 'import' | 'user';
type TimeRange = 'all' | 'today' | '7days' | '30days';

// แมปชื่อฟิลด์ภาษาอังกฤษ -> ภาษาไทย
const fieldLabels: Record<string, string> = {
  location: 'สถานที่ตั้ง',
  branch: 'สาขาวิชา / หน่วยงาน',
  condition: 'สภาพการใช้งาน',
  custodian: 'ผู้รับผิดชอบ / ผู้ดูแล',
  unitSatang: 'ราคาต่อหน่วย',
  totalSatang: 'มูลค่ารวม',
  quantity: 'จำนวน (ชิ้น)',
  category: 'หมวดหมู่',
  name: 'ชื่อรายการครุภัณฑ์',
  code: 'รหัสครุภัณฑ์',
  serial: 'หมายเลขเครื่อง / Serial No.',
  brand: 'ยี่ห้อ / รุ่น',
  notes: 'หมายเหตุ',
  receivedDate: 'วันที่ตรวจรับ/ได้มา',
  lifeYears: 'อายุการใช้งานตามเกณฑ์',
  groupName: 'หมวด/โครงการ',
  status: 'สถานะคำขอ',
  role: 'สิทธิ์การใช้งาน (Role)',
  active: 'สถานะบัญชี'
};

const stocktakeResultMeta: Record<string, { label: string; style: string }> = {
  normal: { label: 'ตรงตามทะเบียน (ปกติ)', style: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  damaged: { label: 'ชำรุด / ส่งซ่อม', style: 'bg-amber-100 text-amber-800 border-amber-300' },
  missing: { label: 'ไม่พบครุภัณฑ์', style: 'bg-rose-100 text-rose-800 border-rose-300' },
  mismatch: { label: 'ข้อมูลไม่ตรง', style: 'bg-purple-100 text-purple-800 border-purple-300' },
  pending: { label: 'รอตรวจนับ', style: 'bg-slate-100 text-slate-700 border-slate-300' }
};

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

function formatRelativeTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'เมื่อวานนี้';
    if (days < 30) return `${days} วันที่แล้ว`;
    return `${Math.floor(days / 30)} เดือนที่แล้ว`;
  } catch {
    return '';
  }
}

function getActionMeta(action: string) {
  const a = (action || '').toLowerCase();

  if (a.includes('เปิดรอบตรวจนับ')) {
    return {
      label: 'เปิดรอบตรวจนับ',
      color: 'text-sky-700',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      badgeBg: 'bg-sky-100/90 text-sky-800 border-sky-300',
      icon: QrCode,
      kind: 'stocktake' as TabKey
    };
  }
  if (a.includes('ปิดรอบตรวจนับ')) {
    return {
      label: 'ปิดรอบตรวจนับ',
      color: 'text-slate-700',
      bg: 'bg-slate-100',
      border: 'border-slate-300',
      badgeBg: 'bg-slate-200/90 text-slate-800 border-slate-300',
      icon: CheckCircle2,
      kind: 'stocktake' as TabKey
    };
  }
  if (a.includes('บันทึกตรวจนับ')) {
    return {
      label: 'บันทึกผลตรวจนับ (QR)',
      color: 'text-sky-700',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      badgeBg: 'bg-sky-100/90 text-sky-800 border-sky-300',
      icon: QrCode,
      kind: 'stocktake' as TabKey
    };
  }
  if (a.includes('check') || a.includes('ตรวจนับ') || a.includes('round')) {
    return {
      label: 'ตรวจนับครุภัณฑ์',
      color: 'text-sky-700',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      badgeBg: 'bg-sky-100/80 text-sky-800 border-sky-200',
      icon: QrCode,
      kind: 'stocktake' as TabKey
    };
  }
  if (a.includes('อนุมัติ')) {
    return {
      label: 'อนุมัติคำขอ',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-300',
      icon: CheckCircle2,
      kind: 'transfer' as TabKey
    };
  }
  if (a.includes('ส่งคำขอกลับ') || a.includes('ปฏิเสธ')) {
    return {
      label: 'ส่งคำขอกลับ',
      color: 'text-rose-700',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      badgeBg: 'bg-rose-100/90 text-rose-800 border-rose-300',
      icon: AlertTriangle,
      kind: 'transfer' as TabKey
    };
  }
  // แบ่งล็อต (รวมกรณี "แบ่งล็อตเพื่อส่งคำขอ") ต้องตรวจก่อนกลุ่ม "ส่งคำขอ" ไม่เช่นนั้นจะถูกแสดงเป็นคำขอโอนย้าย
  if (a.includes('แบ่งล็อต')) {
    return {
      label: a.includes('อนุมัติคำขอ') ? 'แบ่งล็อตเมื่ออนุมัติคำขอ' : a.includes('ส่งคำขอ') ? 'แบ่งล็อตเพื่อส่งคำขอ' : 'ตัดแบ่งจำนวน (แยกล็อต)',
      color: 'text-indigo-700',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      badgeBg: 'bg-indigo-100/80 text-indigo-800 border-indigo-200',
      icon: ArrowLeftRight,
      kind: 'edit' as TabKey
    };
  }
  if (a.includes('ส่งคำขอ') || a.includes('ดำเนินการ')) {
    if (a.includes('ซ่อม')) {
      return {
        label: a.includes('ดำเนินการ') ? 'ส่งซ่อมสำเร็จ' : 'ส่งคำขอส่งซ่อม',
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        badgeBg: 'bg-orange-100/90 text-orange-800 border-orange-300',
        icon: Wrench,
        kind: 'repair' as TabKey
      };
    }
    if (a.includes('จำหน่าย')) {
      return {
        label: a.includes('ดำเนินการ') ? 'จำหน่ายสำเร็จ' : 'ส่งคำขอจำหน่าย',
        color: 'text-rose-700',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        badgeBg: 'bg-rose-100/90 text-rose-800 border-rose-300',
        icon: Trash2,
        kind: 'dispose' as TabKey
      };
    }
    return {
      label: a.includes('ดำเนินการ') ? 'โอนย้ายสำเร็จ' : 'ส่งคำขอโอนย้าย',
      color: 'text-purple-700',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      badgeBg: 'bg-purple-100/90 text-purple-800 border-purple-300',
      icon: ArrowLeftRight,
      kind: 'transfer' as TabKey
    };
  }
  if (a.includes('ซ่อมเสร็จ')) {
    return {
      label: 'ซ่อมเสร็จสิ้น',
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-300',
      icon: CheckCircle2,
      kind: 'repair' as TabKey
    };
  }
  if (a.includes('repair') || a.includes('ซ่อม')) {
    return {
      label: 'แจ้งส่งซ่อม',
      color: 'text-orange-700',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      badgeBg: 'bg-orange-100/80 text-orange-800 border-orange-200',
      icon: Wrench,
      kind: 'repair' as TabKey
    };
  }
  if (a.includes('transfer') || a.includes('โอนย้าย')) {
    return {
      label: 'โอนย้ายสถานที่',
      color: 'text-purple-700',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      badgeBg: 'bg-purple-100/80 text-purple-800 border-purple-200',
      icon: ArrowLeftRight,
      kind: 'transfer' as TabKey
    };
  }
  if (a.includes('dispose') || a.includes('จำหน่าย')) {
    return {
      label: 'ขอจำหน่าย',
      color: 'text-rose-700',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      badgeBg: 'bg-rose-100/80 text-rose-800 border-rose-200',
      icon: Trash2,
      kind: 'dispose' as TabKey
    };
  }
  if (a.includes('import') || a.includes('นำเข้า') || a.includes('excel')) {
    return {
      label: a.includes('อัปโหลด') ? 'อัปโหลดไฟล์ Excel' : 'นำเข้าข้อมูล',
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      badgeBg: 'bg-blue-100/80 text-blue-800 border-blue-200',
      icon: Upload,
      kind: 'import' as TabKey
    };
  }
  if (a.includes('user') || a.includes('ผู้ใช้') || a.includes('สิทธิ์') || a.includes('สายอนุมัติ')) {
    return {
      label: a.includes('สายอนุมัติ') ? 'กำหนดสายอนุมัติ' : 'จัดการผู้ใช้งาน',
      color: 'text-teal-700',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      badgeBg: 'bg-teal-100/80 text-teal-800 border-teal-200',
      icon: ShieldCheck,
      kind: 'user' as TabKey
    };
  }
  if (a.includes('รูป')) {
    return {
      label: 'อัปเดตรูปภาพ',
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      badgeBg: 'bg-blue-100/80 text-blue-800 border-blue-200',
      icon: Eye,
      kind: 'edit' as TabKey
    };
  }
  // Default to edit
  return {
    label: action || 'แก้ไขข้อมูล',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badgeBg: 'bg-amber-100/80 text-amber-800 border-amber-200',
    icon: Pencil,
    kind: 'edit' as TabKey
  };
}

const technicalKeys = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'version',
  'sourceId',
  'sourceRow',
  'passwordHash',
  'token',
  'parentId',
  'salvageSatang',
  'lifecycle',
  // Request / workflow / stocktake technical fields (not asset data)
  'assetId',
  'assetVersion',
  'kind',
  'payload',
  'stage',
  'chain',
  'actor',
  'actorName',
  'imageVersion',
  'imageUrl',
  'result',
  'stocktakeId',
  'requesterId',
  'requesterName',
  'requesterRole',
  'final',
  'year',
  'passwordChanged',
  'costSatang',
  'requested',
  'count',
  'snapshot',
  'from',
  'seq'
]);

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (key === 'unitSatang' || key === 'totalSatang') {
    return `฿${money(Number(val))}`;
  }
  if (key === 'condition' && typeof val === 'string') {
    return conditions[val as keyof typeof conditions] || val;
  }
  if (key === 'result' && typeof val === 'string') {
    return stocktakeResultMeta[val]?.label || val;
  }
  if (key === 'active') {
    return val ? 'เปิดใช้งาน' : 'ระงับการใช้งาน';
  }
  if (key === 'quantity') {
    return `${Number(val).toLocaleString()} ชิ้น`;
  }
  if (key === 'lifeYears') {
    return `${val} ปี`;
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function parseJsonSafe(str: string | null | undefined): Record<string, unknown> {
  if (!str || str === 'null' || str === 'undefined') return {};
  try {
    const parsed = typeof str === 'string' ? JSON.parse(str) : str;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallback safe empty object
  }
  return {};
}

function VisualDiffViewer({
  beforeStr,
  afterStr,
  action = ''
}: {
  beforeStr: string;
  afterStr: string;
  action?: string;
}) {
  const beforeObj = parseJsonSafe(beforeStr);
  const afterObj = parseJsonSafe(afterStr);
  const act = action.toLowerCase();

  // 1. กรณีเปิดรอบตรวจนับ
  if (act.includes('เปิดรอบตรวจนับ')) {
    const roundName = afterObj.name ? String(afterObj.name) : 'รอบตรวจนับใหม่';
    const yearStr = afterObj.year ? ` (ประจำปีงบประมาณ ${afterObj.year})` : '';
    return (
      <div className="bg-sky-50/80 border border-sky-200/90 rounded-lg p-2.5 text-xs flex items-center gap-2 text-sky-900">
        <QrCode size={15} className="text-sky-600 shrink-0" />
        <span>
          เปิดรอบการตรวจนับครุภัณฑ์: <strong className="text-sky-950 font-bold">{roundName}</strong>{yearStr}
        </span>
      </div>
    );
  }

  // 2. กรณีปิดรอบตรวจนับ
  if (act.includes('ปิดรอบตรวจนับ')) {
    return (
      <div className="bg-slate-100/90 border border-slate-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-slate-700">
        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
        <span>สิ้นสุดและปิดรอบการตรวจนับครุภัณฑ์ประจำปีเรียบร้อยแล้ว</span>
      </div>
    );
  }

  // 3. กรณีบันทึกตรวจนับ (QR / สแกน)
  if (act.includes('บันทึกตรวจนับ')) {
    const rawResult = String(afterObj.result || 'normal');
    const resMeta = stocktakeResultMeta[rawResult] || {
      label: rawResult,
      style: 'bg-slate-100 text-slate-700 border-slate-300'
    };
    const qty = afterObj.quantity !== undefined && afterObj.quantity !== null ? Number(afterObj.quantity) : 1;
    return (
      <div className="bg-sky-50/70 border border-sky-200/80 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-2.5">
        <span className="text-slate-600 font-medium">ผลการตรวจนับ:</span>
        <span className={`px-2 py-0.5 rounded-md font-bold text-xs border ${resMeta.style}`}>
          {resMeta.label}
        </span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">
          จำนวนที่พบจริง: <strong className="text-slate-900 font-bold">{qty.toLocaleString('th-TH')} ชิ้น</strong>
        </span>
      </div>
    );
  }

  // 4. กรณีอนุมัติคำขอ
  if (act.includes('อนุมัติ')) {
    const isFinal = Boolean(afterObj.final);
    const stage = afterObj.stage ? Number(afterObj.stage) : 1;
    return (
      <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-emerald-900">
        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
        <span>
          {isFinal
            ? 'อนุมัติคำขอสมบูรณ์ครบทุกขั้นตอนเรียบร้อยแล้ว (มีผลบังคับใช้ในระบบทันที)'
            : `ผ่านการอนุมัติขั้นที่ ${stage} เรียบร้อยแล้ว (ส่งต่อยังผู้มีอำนาจลำดับถัดไป)`}
        </span>
      </div>
    );
  }

  // 5. กรณีส่งคำขอกลับ / ปฏิเสธคำขอ
  if (act.includes('ส่งคำขอกลับ') || act.includes('ปฏิเสธ')) {
    return (
      <div className="bg-rose-50/90 border border-rose-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-rose-900">
        <AlertTriangle size={15} className="text-rose-600 shrink-0" />
        <span>ส่งคำขอกลับให้ผู้ยื่นคำขอแก้ไขหรือทบทวนข้อมูลใหม่</span>
      </div>
    );
  }

  // 5.5 กรณีแบ่งล็อต (รวม "แบ่งล็อตเพื่อส่งคำขอ") ต้องอยู่ก่อนกลุ่ม "ส่งคำขอ" ด้านล่าง
  if (act.includes('แบ่งล็อต')) {
    return (
      <div className="bg-indigo-50/90 border border-indigo-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-indigo-900">
        <ArrowLeftRight size={14} className="text-indigo-600 shrink-0" />
        <span>
          {act.includes('อนุมัติคำขอ')
            ? 'แบ่งล็อตเมื่ออนุมัติขั้นสุดท้าย เพื่อแยกจำนวนที่ระบุในคำขอออกจากรายการเดิม'
            : act.includes('ส่งคำขอ')
            ? 'แบ่งล็อตเพื่อแยกจำนวนที่ยื่นคำขอออกจากรายการเดิม (ทำก่อนการอนุมัติ)'
            : 'ตัดแบ่งจำนวนเพื่อแยกล็อตในทะเบียนครุภัณฑ์เรียบร้อยแล้ว'}
        </span>
      </div>
    );
  }

  // 6. กรณียื่นส่งคำขอ (โอนย้าย / ส่งซ่อม / จำหน่าย)
  if (act.includes('ส่งคำขอ')) {
    const reqPayload = typeof afterObj.payload === 'string'
      ? parseJsonSafe(afterObj.payload)
      : (afterObj.payload && typeof afterObj.payload === 'object' ? afterObj.payload as Record<string, unknown> : {});

    if (act.includes('ซ่อม')) {
      // คีย์ที่ backend บันทึกคือ estimateSatang (ดู asset-mutations.ts) ไม่ใช่ estimatedCostSatang
      const estimate = Number(reqPayload.estimateSatang ?? reqPayload.estimatedCostSatang ?? 0);
      return (
        <div className="bg-orange-50/80 border border-orange-200 rounded-lg p-2.5 text-xs space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-orange-950">
            <Wrench size={14} className="text-orange-600 shrink-0" />
            <span className="font-semibold">ยื่นคำขอส่งซ่อมแซม:</span>
            {reqPayload.symptom ? <span>อาการ: <strong>{String(reqPayload.symptom)}</strong></span> : null}
            {estimate > 0 ? (
              <span>· ประมาณการค่าใช้จ่าย: <strong>฿{money(estimate)}</strong></span>
            ) : null}
          </div>
        </div>
      );
    }

    if (act.includes('จำหน่าย')) {
      return (
        <div className="bg-rose-50/80 border border-rose-200 rounded-lg p-2.5 text-xs space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-rose-950">
            <Trash2 size={14} className="text-rose-600 shrink-0" />
            <span className="font-semibold">ยื่นคำขอจำหน่ายครุภัณฑ์ออกจากบัญชี:</span>
            {reqPayload.method ? <span>วิธีจำหน่าย: <strong>{String(reqPayload.method)}</strong></span> : null}
            {reqPayload.quantity ? <span>· จำนวน: <strong>{Number(reqPayload.quantity)} ชิ้น</strong></span> : null}
          </div>
        </div>
      );
    }

    // Default to transfer
    return (
      <div className="bg-purple-50/80 border border-purple-200 rounded-lg p-2.5 text-xs space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-purple-950">
          <ArrowLeftRight size={14} className="text-purple-600 shrink-0" />
          <span className="font-semibold">ยื่นคำขอโอนย้ายสถานที่ / ผู้ถือครอง:</span>
          {/* คีย์ที่ backend บันทึกคือ branch / location (targetBranch / targetLocation เป็นชื่อเก่า) */}
          {(reqPayload.branch ?? reqPayload.targetBranch) ? <span>สาขาวิชาใหม่: <strong>{String(reqPayload.branch ?? reqPayload.targetBranch)}</strong></span> : null}
          {(reqPayload.location ?? reqPayload.targetLocation) ? <span>สถานที่ใหม่: <strong>{String(reqPayload.location ?? reqPayload.targetLocation)}</strong></span> : null}
          {(reqPayload.custodian ?? reqPayload.targetCustodian) ? <span>ผู้รับผิดชอบใหม่: <strong>{String(reqPayload.custodian ?? reqPayload.targetCustodian)}</strong></span> : null}
          {reqPayload.quantity ? <span>· จำนวน: <strong>{Number(reqPayload.quantity)} ชิ้น</strong></span> : null}
        </div>
      </div>
    );
  }

  // 7. กรณีดำเนินการทางกายภาพสำเร็จ (โอนย้ายสำเร็จ / จำหน่ายสำเร็จ)
  if (act.includes('ดำเนินการ')) {
    if (act.includes('จำหน่าย')) {
      return (
        <div className="bg-rose-50/90 border border-rose-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-rose-900">
          <CheckCircle2 size={15} className="text-rose-600 shrink-0" />
          <span>ตัดจำหน่ายครุภัณฑ์ออกจากทะเบียนใช้งานเรียบร้อยแล้ว</span>
        </div>
      );
    }
    return (
      <div className="bg-purple-50/90 border border-purple-200 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-2 text-purple-900">
        <CheckCircle2 size={15} className="text-purple-600 shrink-0" />
        <span className="font-semibold">ดำเนินการโอนย้ายสำเร็จ:</span>
        {(afterObj.branch ?? afterObj.targetBranch) ? <span>สังกัดใหม่: <strong>{String(afterObj.branch ?? afterObj.targetBranch)}</strong></span> : null}
        {(afterObj.location ?? afterObj.targetLocation) ? <span>สถานที่ใหม่: <strong>{String(afterObj.location ?? afterObj.targetLocation)}</strong></span> : null}
        {(afterObj.custodian ?? afterObj.targetCustodian) ? <span>ผู้รับผิดชอบใหม่: <strong>{String(afterObj.custodian ?? afterObj.targetCustodian)}</strong></span> : null}
      </div>
    );
  }

  // 8. กรณีซ่อมเสร็จสิ้น
  if (act.includes('ซ่อมเสร็จ')) {
    return (
      <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-2 text-emerald-900">
        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
        <span>ซ่อมบำรุงเสร็จสิ้น ปรับสภาพเป็น: <strong>ปกติ (พร้อมใช้งาน)</strong></span>
        {afterObj.costSatang ? <span>· ค่าใช้จ่ายจริง: <strong>฿{money(Number(afterObj.costSatang))} บาท</strong></span> : null}
      </div>
    );
  }

  // 10. กรณีจัดการรูปภาพ
  if (act.includes('รูป')) {
    return (
      <div className="bg-blue-50/90 border border-blue-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-blue-900">
        <Eye size={15} className="text-blue-600 shrink-0" />
        <span>
          {act.includes('ลบ')
            ? 'ลบภาพถ่ายครุภัณฑ์ออกจากระบบเรียบร้อยแล้ว'
            : 'อัปเดตภาพถ่ายครุภัณฑ์ในระบบเรียบร้อยแล้ว'}
        </span>
      </div>
    );
  }

  // 11. กรณีจัดการสิทธิ์ผู้ใช้
  if (act.includes('สิทธิ์') || act.includes('user') || act.includes('ผู้ใช้')) {
    const roleMap: Record<string, string> = {
      admin: 'ผู้ดูแลระบบ (Admin)',
      staff: 'เจ้าหน้าที่พัสดุ (Staff)',
      approver: 'ผู้อนุมัติ (Approver)',
      viewer: 'ผู้เรียกดูข้อมูล (Viewer)',
      central: 'เจ้าหน้าที่ส่วนกลาง'
    };
    return (
      <div className="bg-teal-50/90 border border-teal-200 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-3 text-teal-900">
        <UserCheck size={15} className="text-teal-600 shrink-0" />
        {afterObj.name ? <span>ชื่อ: <strong>{String(afterObj.name)}</strong></span> : null}
        {afterObj.email ? <span>อีเมล: <strong>{String(afterObj.email)}</strong></span> : null}
        {afterObj.role ? <span>สิทธิ์: <strong>{roleMap[String(afterObj.role)] || String(afterObj.role)}</strong></span> : null}
        {afterObj.active !== undefined ? (
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${afterObj.active ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'}`}>
            {afterObj.active ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
          </span>
        ) : null}
        {afterObj.passwordChanged ? <span className="text-teal-700 italic">(เปลี่ยนรหัสผ่าน)</span> : null}
      </div>
    );
  }

  // 12. กรณีกำหนดสายอนุมัติ
  if (act.includes('สายอนุมัติ')) {
    return (
      <div className="bg-teal-50/90 border border-teal-200 rounded-lg p-2.5 text-xs flex items-center gap-2 text-teal-900">
        <ShieldCheck size={15} className="text-teal-600 shrink-0" />
        <span>บันทึกการปรับปรุงลำดับและรายชื่อในสายการอนุมัติเรียบร้อยแล้ว</span>
      </div>
    );
  }

  // 13a. กรณีอัปโหลดไฟล์ Excel: เก็บไฟล์ต้นฉบับเท่านั้น ยังไม่ได้นำรายการเข้าทะเบียน
  if (act.includes('อัปโหลด')) {
    const rows = afterObj.rows ?? afterObj.rowCount;
    const fileName = typeof afterObj.name === 'string' ? ` "${afterObj.name}"` : '';
    return (
      <div className="bg-blue-50/90 border border-blue-200/90 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-2 text-blue-900">
        <Upload size={14} className="text-blue-600 shrink-0" />
        <span>
          อัปโหลดไฟล์ต้นฉบับ{fileName}
          {rows !== undefined && rows !== null ? ` (${Number(rows).toLocaleString()} แถว)` : ''} สำเร็จ · ยังไม่ได้นำรายการเข้าทะเบียน
        </span>
      </div>
    );
  }

  // 13. กรณีนำเข้า Excel
  const count = afterObj.rows ?? afterObj.rowCount ?? afterObj.imported ?? afterObj.count;
  if (count !== undefined && count !== null) {
    const filename = typeof afterObj.filename === 'string' ? ` (ไฟล์: ${afterObj.filename})` : '';
    const totalMoney = afterObj.totalSatang ? ` · มูลค่ารวม ฿${money(Number(afterObj.totalSatang))} บาท` : '';
    return (
      <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-lg p-2.5 text-xs flex flex-wrap items-center gap-2">
        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-emerald-600" />
          บันทึกข้อมูลเข้าสู่ระบบสำเร็จ {Number(count).toLocaleString()} รายการ{filename}{totalMoney}
        </span>
      </div>
    );
  }

  if (Object.keys(beforeObj).length === 0 && Object.keys(afterObj).length === 0) {
    return (
      <div className="text-[11.5px] text-slate-400 italic">
        ไม่มีรายละเอียดการเปลี่ยนแปลงที่บันทึกไว้
      </div>
    );
  }

  // 14. กรณีเพิ่มครุภัณฑ์ใหม่ (Create New Asset)
  const isCreate = Object.keys(beforeObj).length === 0 || (action && action.includes('เพิ่ม'));
  if (isCreate) {
    const fieldsToDisplay: Array<{ label: string; val: string }> = [];
    const priorityKeys = [
      'location',
      'branch',
      'category',
      'quantity',
      'unitSatang',
      'totalSatang',
      'condition',
      'serial',
      'brand',
      'custodian',
      'groupName',
      'receivedDate',
      'notes'
    ];

    for (const k of priorityKeys) {
      const v = afterObj[k];
      if (v === null || v === undefined || v === '') continue;
      if (k === 'lifeYears' && Number(v) === 0) continue;
      if (k === 'notes' && !String(v).trim()) continue;
      if (k === 'groupName' && String(v).trim() === 'ทั่วไป') continue;
      if (k === 'totalSatang' && (Number(afterObj.quantity) <= 1 || Number(v) === Number(afterObj.unitSatang))) continue;
      const formatted = formatValue(k, v);
      if (formatted !== '—') {
        fieldsToDisplay.push({
          label: fieldLabels[k] || k,
          val: formatted
        });
      }
    }

    if (fieldsToDisplay.length > 0) {
      return (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-2.5 text-xs space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            ข้อมูลสำคัญที่ลงทะเบียน:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fieldsToDisplay.map((f, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-md border border-slate-200/80 shadow-2xs">
                <span className="text-slate-500 font-medium text-[11.5px]">{f.label}:</span>
                <span className="font-bold text-slate-800 text-[11.5px]">{f.val}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  // 15. กรณีแก้ไขข้อมูลครุภัณฑ์ (Edit Asset Diff)
  const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  const diffs: Array<{ key: string; label: string; oldVal: string; newVal: string }> = [];

  for (const k of allKeys) {
    if (technicalKeys.has(k)) continue;
    const oldV = beforeObj[k];
    const newV = afterObj[k];
    const oldFormatted = formatValue(k, oldV);
    const newFormatted = formatValue(k, newV);

    // ถ้าค่าเหมือนเดิม ให้ข้ามไป
    if (oldFormatted === newFormatted) continue;
    // ทั้งคู่ว่าง ข้ามไป
    if (oldFormatted === '—' && (newFormatted === '—' || !newFormatted)) continue;
    // ค่าใหม่ว่าง → after snapshot ไม่มีฟิลด์นี้ ไม่ใช่การลบจริง ข้ามไป
    if (newFormatted === '—') continue;
    // ค่าเดิมว่าง และเป็นฟิลด์ที่ไม่สำคัญ ข้ามไป
    if (oldFormatted === '—' && !fieldLabels[k]) continue;

    diffs.push({
      key: k,
      label: fieldLabels[k] || k,
      oldVal: oldFormatted,
      newVal: newFormatted
    });
  }

  if (diffs.length === 0) {
    return (
      <div className="text-[11.5px] text-slate-400 italic">
        ไม่มีข้อมูลฟิลด์สำคัญที่มีการเปลี่ยนแปลง
      </div>
    );
  }

  return (
    <div className="bg-slate-50/90 border border-slate-200 rounded-lg p-2.5 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {diffs.map(d => (
          <div key={d.key} className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-600 text-[11.5px]">{d.label}:</span>
            <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded text-[11px] line-through border border-rose-100">
              {d.oldVal}
            </span>
            <span className="text-slate-400 text-xs font-bold">→</span>
            <span className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded text-[11px] border border-emerald-200">
              {d.newVal}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditView({
  data,
  select,
  open
}: {
  data: WorkspaceData;
  select?: (a: Asset) => void;
  open?: (k: string, a?: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [page, setPage] = useState(0);

  // getData ส่งมาแค่ 100 รายการล่าสุด ประวัติเก่ากว่านั้นโหลดเพิ่มทีละ 200 รายการ
  const [older, setOlder] = useState<AuditRecord[]>([]);
  const [olderState, setOlderState] = useState<{ more: boolean; total: number | null; loading: boolean }>({ more: true, total: null, loading: false });
  const events: AuditRecord[] = useMemo(() => {
    const seen = new Set((data.events || []).map(e => e.id));
    return [...(data.events || []), ...older.filter(e => !seen.has(e.id))];
  }, [data.events, older]);
  // มีเหตุการณ์ใหม่เข้ามา (100 รายการล่าสุดเลื่อนไป) ประวัติเก่าที่โหลดไว้อาจไม่ต่อกันแล้ว จึงล้างแล้วให้โหลดใหม่
  // การโหลดที่ค้างอยู่ตอนล้างก็ทิ้งผล (olderRound) ไม่ให้ต่อท้ายผิดช่วง
  const newestId = data.events?.[0]?.id ?? '';
  const olderRound = useRef(0);
  useEffect(() => {
    olderRound.current++;
    setOlder([]);
    setOlderState({ more: true, total: null, loading: false });
  }, [newestId]);
  async function loadOlder() {
    const last = events[events.length - 1];
    const oldest = last?.createdAt;
    if (!oldest || olderState.loading) return;
    const round = olderRound.current;
    setOlderState(s => ({ ...s, loading: true }));
    try {
      const r = await api<{ events: AuditRecord[]; more: boolean; total: number }>('?view=audit&before=' + encodeURIComponent(oldest) + '&beforeId=' + encodeURIComponent(last.id));
      if (round !== olderRound.current) return;
      setOlder(prev => [...prev, ...r.events]);
      setOlderState({ more: r.more, total: r.total, loading: false });
    } catch {
      if (round === olderRound.current) setOlderState(s => ({ ...s, loading: false }));
    }
  }
  const assets: Asset[] = data.assets || [];

  // สถิติ KPI ด้านบน 4 ใบ
  const stats = useMemo(() => {
    let total = events.length;
    let editCount = 0;
    let movementCount = 0;
    let systemCount = 0;

    for (const e of events) {
      const meta = getActionMeta(e.action);
      if (meta.kind === 'edit') editCount++;
      else if (meta.kind === 'transfer' || meta.kind === 'repair' || meta.kind === 'dispose' || meta.kind === 'stocktake') movementCount++;
      else if (meta.kind === 'import' || meta.kind === 'user') systemCount++;
    }

    return { total, editCount, movementCount, systemCount };
  }, [events]);

  // ตัวกรองรายการประวัติ
  const filtered = useMemo(() => {
    return events.filter(e => {
      // 1. กรองตามแท็บประเภท
      if (tab !== 'all') {
        const meta = getActionMeta(e.action);
        if (meta.kind !== tab) return false;
      }

      // 2. กรองตามช่วงเวลา
      if (timeRange !== 'all') {
        const d = new Date(e.createdAt);
        const diffMs = Date.now() - d.getTime();
        const days = diffMs / (1000 * 60 * 60 * 24);
        if (timeRange === 'today' && days > 1) return false;
        if (timeRange === '7days' && days > 7) return false;
        if (timeRange === '30days' && days > 30) return false;
      }

      // 3. กรองตามช่องค้นหา
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const linkedAsset = assets.find(a => a.id === e.assetId);
        const match = [
          e.action,
          e.actorName,
          e.reason,
          e.assetId,
          linkedAsset?.code,
          linkedAsset?.name,
          e.before,
          e.after
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!match.includes(q)) return false;
      }

      return true;
    });
  }, [events, tab, timeRange, search, assets]);

  const pageSize = 15;
  const paginated = useMemo(() => {
    return filtered.slice(page * pageSize, (page + 1) * pageSize);
  }, [filtered, page]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 📊 4 KPI Summary Cards matching desktop_9_audit.svg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: ประวัติทั้งหมด */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <History size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ประวัติเหตุการณ์ทั้งหมด</span>
            <strong className="text-xl font-bold text-slate-900 block leading-tight">
              {stats.total.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-blue-600 block mt-0.5 font-medium">บันทึกอัตโนมัติทุกการเปลี่ยนแปลง</span>
          </div>
        </div>

        {/* Card 2: แก้ไขสเปก / สถานที่ / ราคา */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Pencil size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">แก้ไขสเปก / สถานที่ / ราคา</span>
            <strong className="text-xl font-bold text-amber-600 block leading-tight">
              {stats.editCount.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-amber-700 block mt-0.5 font-medium">ปรับปรุงข้อมูลในทะเบียน</span>
          </div>
        </div>

        {/* Card 3: โอนย้าย / ส่งซ่อม / คำขอ */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <ArrowLeftRight size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">โอนย้าย / ซ่อม / จำหน่าย / ตรวจนับ</span>
            <strong className="text-xl font-bold text-purple-600 block leading-tight">
              {stats.movementCount.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-purple-700 block mt-0.5 font-medium">ความเคลื่อนไหวทางกายภาพ</span>
          </div>
        </div>

        {/* Card 4: นำเข้า Excel / ผู้ใช้ */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Upload size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">นำเข้า Excel / บัญชีผู้ใช้</span>
            <strong className="text-xl font-bold text-emerald-600 block leading-tight">
              {stats.systemCount.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-emerald-700 block mt-0.5 font-medium">รายการระบบและการจัดการสิทธิ์</span>
          </div>
        </div>
      </div>

      {/* 🔍 Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all' as TabKey, label: `ทั้งหมด (${events.length})` },
            { key: 'stocktake' as TabKey, label: 'ตรวจนับ (QR)' },
            { key: 'transfer' as TabKey, label: 'โอนย้าย' },
            { key: 'repair' as TabKey, label: 'ส่งซ่อม' },
            { key: 'dispose' as TabKey, label: 'ขอจำหน่าย' },
            { key: 'edit' as TabKey, label: `แก้ไขข้อมูล (${stats.editCount})` },
            { key: 'import' as TabKey, label: 'นำเข้าข้อมูล' },
            { key: 'user' as TabKey, label: 'ผู้ใช้/สิทธิ์' }
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setPage(0);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                tab === t.key
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative min-w-[260px] sm:min-w-[320px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              placeholder="ค้นหาผู้ดำเนินการ, รหัสครุภัณฑ์, รายการ หรือเหตุผล…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className={`pl-9 h-9 text-xs bg-white border-slate-200 ${search ? 'pr-8' : ''}`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="ล้างคำค้นหา"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Time Range Filter */}
          <select
            aria-label="ช่วงเวลา"
            value={timeRange}
            onChange={e => {
              setTimeRange(e.target.value as TimeRange);
              setPage(0);
            }}
            className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium outline-none cursor-pointer hover:border-slate-300"
          >
            <option value="all">ทุกช่วงเวลา</option>
            <option value="today">วันนี้</option>
            <option value="7days">7 วันล่าสุด</option>
            <option value="30days">30 วันล่าสุด</option>
          </select>
        </div>
      </div>

      {/* 📋 Main Audit Records Panel */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History size={17} className="text-blue-600" />
              บันทึกเหตุการณ์ประวัติล่าสุด (Audit Records)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ติดตามทุกการบันทึก การอนุมัติ และการแก้ไขข้อมูลในระบบ
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            พบ {filtered.length} รายการ
          </span>
        </div>

        {/* Audit Items List */}
        <div className="divide-y divide-slate-100">
          {paginated.map(e => {
            const meta = getActionMeta(e.action);
            const Icon = meta.icon;
            const afterObj = parseJsonSafe(e.after);
            const beforeObj = parseJsonSafe(e.before);

            // รายการระดับระบบ (เช่น เปิด/ปิดรอบตรวจนับ, จัดการผู้ใช้, นำเข้า Excel) ไม่เชื่อมโยง Asset เดี่ยว
            const isSystemEvent = [
              'เปิดรอบตรวจนับ',
              'ปิดรอบตรวจนับ',
              'อัปโหลด excel',
              'นำเข้าครุภัณฑ์แบบกลุ่ม',
              'จัดการสิทธิ์ผู้ใช้',
              'กำหนดสายอนุมัติ'
            ].some(prefix => (e.action || '').toLowerCase().includes(prefix));

            const linkedAsset = !isSystemEvent ? assets.find(a => 
              (e.assetId && a.id === e.assetId) ||
              (afterObj.id && a.id === String(afterObj.id)) ||
              (afterObj.code && a.code === String(afterObj.code)) ||
              (beforeObj.code && a.code === String(beforeObj.code))
            ) : null;

            return (
              <div key={e.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left Column: Type Icon & Main Content */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Category Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center shrink-0 border ${meta.border} shadow-xs mt-0.5`}
                    >
                      <Icon size={18} />
                    </div>

                    {/* Information */}
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Row 1: Action Badge + Asset Code + Name หรือ Round info */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${meta.badgeBg}`}
                        >
                          {meta.label}
                        </span>

                        {(e.action || '').includes('เปิดรอบตรวจนับ') && afterObj.name ? (
                          <span className="text-xs font-bold text-slate-800">
                            {String(afterObj.name)} {afterObj.year ? `(ปีงบ ${afterObj.year})` : ''}
                          </span>
                        ) : linkedAsset ? (
                          <>
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 select-all">
                              {linkedAsset.code}
                            </span>
                            <span className="text-xs font-bold text-slate-900 line-clamp-1">
                              {linkedAsset.name}
                            </span>
                          </>
                        ) : !isSystemEvent && afterObj.code ? (
                          <>
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 select-all">
                              {String(afterObj.code)}
                            </span>
                            {afterObj.name ? (
                              <span className="text-xs font-bold text-slate-900 line-clamp-1">
                                {String(afterObj.name)}
                              </span>
                            ) : null}
                          </>
                        ) : !isSystemEvent && e.assetId ? (
                          <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {e.assetId}
                          </span>
                        ) : null}
                      </div>

                      {/* Row 2: Actor & Reason */}
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">
                          ผู้ดำเนินการ:{' '}
                          <strong className="text-slate-900 font-bold">
                            {e.actorName || 'ผู้ใช้ในระบบ'}
                          </strong>
                        </span>
                        {e.reason && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-700">
                              เหตุผล: <span className="italic">{e.reason}</span>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row 3: Human-Readable Field Diff Viewer */}
                      <VisualDiffViewer beforeStr={e.before} afterStr={e.after} action={e.action} />
                    </div>
                  </div>

                  {/* Right Column: Timestamp & Action Buttons */}
                  <div className="flex sm:flex-col sm:items-end justify-between sm:justify-start gap-2 shrink-0 pt-1">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {formatThaiDateTime(e.createdAt)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatRelativeTime(e.createdAt)}
                      </div>
                    </div>

                    {/* View Asset Button */}
                    {linkedAsset && select && !isSystemEvent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => select(linkedAsset)}
                        className="h-8 px-3 text-xs font-semibold text-blue-700 bg-blue-50/90 hover:bg-blue-600 hover:text-white border-blue-200 cursor-pointer rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs mt-1"
                        title="เปิดดูรายละเอียดครุภัณฑ์นี้"
                      >
                        <Eye size={13} />
                        <span>เปิดดูครุภัณฑ์</span>
                        <ArrowRight size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!filtered.length && (
            <div className="py-12">
              <Empty title={events.length ? 'ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง' : 'ยังไม่มีบันทึกประวัติเหตุการณ์'}>
                <p className="text-xs text-slate-400 mt-1">
                  {events.length
                    ? 'ลองเปลี่ยนคำค้นหา หรือเลือกตัวกรองช่วงเวลาอื่น'
                    : 'เมื่อมีการเพิ่ม แก้ไข หรือส่งคำขอในระบบ ประวัติจะถูกบันทึกที่นี่โดยอัตโนมัติ'}
                </p>
              </Empty>
            </div>
          )}
        </div>

        {/* 📑 Pagination Bar */}
        {filtered.length > pageSize && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              แสดงรายการที่ {page * pageSize + 1} - {Math.min((page + 1) * pageSize, filtered.length)} จากทั้งหมด{' '}
              {filtered.length} เหตุการณ์
            </span>
            <Pager page={page} total={filtered.length} size={pageSize} onChange={setPage} />
          </div>
        )}
        {/* โหลดประวัติเก่าเพิ่ม: ระบบส่งมาเฉพาะ 100 เหตุการณ์ล่าสุด */}
        <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            โหลดแล้ว {events.length.toLocaleString('th-TH')} เหตุการณ์ล่าสุด
            {olderState.total !== null && ` จากทั้งหมด ${olderState.total.toLocaleString('th-TH')} เหตุการณ์`}
          </span>
          {olderState.more && events.length > 0 && (
            <button type="button" onClick={loadOlder} disabled={olderState.loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
              {olderState.loading ? 'กำลังโหลด…' : 'โหลดประวัติเก่าเพิ่ม (200 รายการ)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
