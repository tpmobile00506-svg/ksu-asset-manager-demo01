'use client';

import { useState, useMemo, useEffect } from 'react';
import { Printer, TrendingDown, CheckCircle2, AlertCircle, FileSpreadsheet, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Asset, money, bookValue, standardBranches, fiscalYearAsOfDate, fiscalYearOf, remainingLifeYears, thaiDateOnly, lifeBucket, lifeBucketLabels, type LifeBucket } from '@/shared/domain';
import { printAssets } from '@/frontend/services/excel-export';
import { Badge, Empty, Pager } from '@/frontend/components/common';
import type { WorkspaceData } from '@/shared/models';

export default function ReportsView({
  data,
  select
}: {
  data: Pick<WorkspaceData, 'assets'>;
  select: (a: Asset) => void;
}) {
  // ปีงบประมาณปัจจุบันคำนวณจากวันนี้ (เริ่ม 1 ต.ค.) แทนการเขียนปีตายตัว
  const currentFiscalYear = fiscalYearOf(new Date());
  const [fiscalYear, setFiscalYear] = useState(String(currentFiscalYear));
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [page, setPage] = useState(0);

  // วันที่ของรายงาน: ปีงบที่จบแล้ว = 30 ก.ย. ของปีนั้น · ปีงบปัจจุบัน = วันนี้ (ไม่คำนวณค่าเสื่อมล่วงหน้า)
  // วันนี้ใช้วันที่ตามเวลาในเครื่อง (toISOString เป็น UTC ช้ากว่าไทย 7 ชั่วโมง หลังเที่ยงคืนจะได้วันก่อนหน้า)
  // เปิดหน้าค้างข้ามเที่ยงคืน: เปลี่ยนวันของรายงานตาม (ตั้งเวลาไว้ที่เที่ยงคืนถัดไป)
  const [day, setDay] = useState(() => new Date().toDateString());
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => setDay(new Date().toDateString()), nextMidnight + 1000);
    return () => clearTimeout(timer);
  }, [day]);
  const { asOfDate, asOfIso } = useMemo(() => {
    const end = fiscalYearAsOfDate(fiscalYear), now = new Date();
    if (end.getTime() <= now.getTime()) return { asOfDate: end, asOfIso: end.toISOString().slice(0, 10) };
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return { asOfDate: now, asOfIso: local };
  }, [fiscalYear, day]);

  // ของที่รับเข้าหลังวันที่รายงาน ยังไม่มีอยู่ ณ วันนั้น จึงไม่นับ
  const active = useMemo(
    () => data.assets.filter(a => a.lifecycle === 'active' && !(a.receivedDate && a.receivedDate > asOfIso)),
    [data.assets, asOfIso]
  );
  const receivedLater = useMemo(
    () => data.assets.filter(a => a.lifecycle === 'active' && a.receivedDate && a.receivedDate > asOfIso).length,
    [data.assets, asOfIso]
  );

  const filtered = useMemo(() => {
    return active.filter(a =>
      (selectedBranch === 'all' || a.branch === selectedBranch) &&
      (selectedCategory === 'all' || a.category === selectedCategory)
    );
  }, [active, selectedBranch, selectedCategory]);


  // Financial Calculations
  const stats = useMemo(() => {
    let totalCost = 0;
    let totalNetBook = 0;
    let totalAccDep = 0;
    let fullyDepreciatedCount = 0;

    for (const a of filtered) {
      totalCost += a.totalSatang;
      const bv = bookValue(a, asOfDate);
      if (bv !== null) {
        totalNetBook += bv;
        totalAccDep += Math.max(0, a.totalSatang - bv);
        // ตัดค่าเสื่อมครบ = มูลค่าสุทธิเหลือเท่ามูลค่าซาก (เดิมเทียบกับ 1 บาท ทำให้ของราคาต่ำกว่า 1 บาทนับว่าครบตั้งแต่วันแรก)
        if (a.lifeYears > 0 && bv <= a.salvageSatang) {
          fullyDepreciatedCount++;
        }
      } else {
        totalNetBook += a.totalSatang;
      }
    }

    const accDepPercent = totalCost > 0 ? ((totalAccDep / totalCost) * 100).toFixed(1) : '0.0';

    return {
      totalCost,
      totalAccDep,
      totalNetBook,
      accDepPercent,
      fullyDepreciatedCount,
      count: filtered.length
    };
  }, [filtered, asOfDate]);

  const branches = useMemo(() => {
    return Array.from(new Set([...standardBranches, ...active.map(a => a.branch)])).filter(Boolean);
  }, [active]);

  const categories = useMemo(() => Array.from(new Set(active.map(a => a.category))).filter(Boolean).sort((x, y) => x.localeCompare(y, 'th')), [active]);

  // สรุปตามหมวดหมู่ และตามช่วงอายุการใช้งานคงเหลือ (นับเป็นรายการ, ราคาทุน, มูลค่าสุทธิ ณ สิ้นปีงบประมาณที่เลือก)
  const summaries = useMemo(() => {
    type Row = { count: number; cost: number; net: number };
    const empty = (): Row => ({ count: 0, cost: 0, net: 0 });
    const byCategory = new Map<string, Row>();
    const byLife = new Map<LifeBucket, Row>();
    for (const a of filtered) {
      const net = bookValue(a, asOfDate) ?? a.totalSatang;
      const catName = a.category || 'ไม่ระบุหมวดหมู่';
      const cat = byCategory.get(catName) ?? empty();
      cat.count++; cat.cost += a.totalSatang; cat.net += net;
      byCategory.set(catName, cat);
      const key = lifeBucket(a, asOfDate);
      const life = byLife.get(key) ?? empty();
      life.count++; life.cost += a.totalSatang; life.net += net;
      byLife.set(key, life);
    }
    const lifeOrder: LifeBucket[] = ['expired', 'within1', 'within3', 'over3', 'unknown'];
    return {
      category: [...byCategory.entries()].sort((x, y) => y[1].cost - x[1].cost),
      life: lifeOrder.filter(k => byLife.has(k)).map(k => [k, byLife.get(k)!] as const)
    };
  }, [filtered, asOfDate]);

  const handlePrint = () => {
    printAssets(filtered, { asOf: asOfDate, asOfLabel: thaiDateOnly(asOfIso) });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 4 Financial Summary KPI Cards matching desktop_5_reports.svg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: ราคาทุนรวมทั้งสิ้น */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 font-bold text-lg">
            ฿
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ราคาทุนรวมทั้งสิ้น</span>
            <strong className="text-xl font-bold text-slate-900 block leading-tight">
              {money(stats.totalCost)} ฿
            </strong>
            <span className="text-[11px] font-bold text-blue-600 block mt-0.5">
              ครุภัณฑ์ทั้งหมด {stats.count.toLocaleString('th-TH')} รายการ
            </span>
          </div>
        </div>

        {/* Card 2: ค่าเสื่อมราคาสะสม */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <TrendingDown size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ค่าเสื่อมราคาสะสม</span>
            <strong className="text-xl font-bold text-rose-600 block leading-tight">
              {money(stats.totalAccDep)} ฿
            </strong>
            <span className="text-[11px] text-rose-700 block mt-0.5">
              คิดเป็น {stats.accDepPercent}% ของมูลค่าทุน
            </span>
          </div>
        </div>

        {/* Card 3: มูลค่าสุทธิตามบัญชี */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 size={22} className="stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">มูลค่าสุทธิตามบัญชี</span>
            <strong className="text-xl font-bold text-emerald-600 block leading-tight">
              {money(stats.totalNetBook)} ฿
            </strong>
            <span className="text-[11px] text-emerald-700 block mt-0.5">
              มูลค่าสินทรัพย์คงเหลือจริง
            </span>
          </div>
        </div>

        {/* Card 4: ครุภัณฑ์ครบอายุใช้งาน */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <AlertCircle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-medium block">ครุภัณฑ์ครบอายุการใช้งาน</span>
            <strong className="text-xl font-bold text-amber-600 block leading-tight">
              {stats.fullyDepreciatedCount.toLocaleString('th-TH')} รายการ
            </strong>
            <span className="text-[11px] text-amber-700 block mt-0.5">
              มูลค่าสุทธิเท่ามูลค่าซากแล้ว
            </span>
          </div>
        </div>
      </div>

      {/* Action / Filter Bar matching desktop_5_reports.svg */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold text-slate-700">ปีงบประมาณ:</span>
            <select
              aria-label="ปีงบประมาณ"
              value={fiscalYear}
              onChange={e => setFiscalYear(e.target.value)}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer"
            >
              {[0, 1, 2, 3, 4].map(n => (
                <option key={n} value={String(currentFiscalYear - n)}>
                  {currentFiscalYear - n}{n === 0 ? ' (ปัจจุบัน)' : ''}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            ข้อมูล ณ {thaiDateOnly(asOfIso)}
            {receivedLater > 0 && ` · ไม่รวม ${receivedLater.toLocaleString('th-TH')} รายการที่รับเข้าหลังวันที่รายงาน`}
          </span>

          {/* Department selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Filter size={13} className="text-slate-400" />
            <span className="font-bold text-slate-700">สาขาวิชา:</span>
            <select
              aria-label="สาขาวิชา"
              value={selectedBranch}
              onChange={e => {
                setSelectedBranch(e.target.value);
                setPage(0);
              }}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">ทุกสาขาวิชา</option>
              {branches.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Category selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Filter size={13} className="text-slate-400" />
            <span className="font-bold text-slate-700">หมวดหมู่:</span>
            <select
              aria-label="หมวดหมู่"
              value={selectedCategory}
              onChange={e => {
                setSelectedCategory(e.target.value);
                setPage(0);
              }}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">ทุกหมวดหมู่</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!filtered.length}
            onClick={handlePrint}
            className="h-9 px-3 text-xs font-bold bg-[#2563eb] hover:bg-[#1d4ed8] text-white cursor-pointer shadow-sm"
          >
            <Printer size={14} className="mr-1" /> พิมพ์รายงาน (PDF)
          </Button>
        </div>
      </div>

      {/* สรุปตามหมวดหมู่ และช่วงอายุการใช้งานคงเหลือ */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">สรุปตามหมวดหมู่</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 text-xs">
                  <TableHead className="font-bold">หมวดหมู่</TableHead>
                  <TableHead className="font-bold text-right">รายการ</TableHead>
                  <TableHead className="font-bold text-right">ราคาทุน</TableHead>
                  <TableHead className="font-bold text-right">มูลค่าสุทธิ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.category.map(([name, r]) => (
                  <TableRow key={name} className="text-xs">
                    <TableCell className="font-medium text-slate-800">{name}</TableCell>
                    <TableCell className="text-right">{r.count.toLocaleString('th-TH')}</TableCell>
                    <TableCell className="text-right">฿{money(r.cost)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">฿{money(r.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">สรุปตามอายุการใช้งานคงเหลือ</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">ณ สิ้นปีงบประมาณที่เลือก · รายการที่ไม่ระบุวันรับหรืออายุใช้งานนับมูลค่าสุทธิเท่าราคาทุน</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 text-xs">
                  <TableHead className="font-bold">ช่วงอายุคงเหลือ</TableHead>
                  <TableHead className="font-bold text-right">รายการ</TableHead>
                  <TableHead className="font-bold text-right">ราคาทุน</TableHead>
                  <TableHead className="font-bold text-right">มูลค่าสุทธิ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.life.map(([key, r]) => (
                  <TableRow key={key} className="text-xs">
                    <TableCell className={key === 'expired' ? 'font-medium text-rose-700' : key === 'unknown' ? 'font-medium text-amber-700' : 'font-medium text-slate-800'}>
                      {lifeBucketLabels[key]}
                    </TableCell>
                    <TableCell className="text-right">{r.count.toLocaleString('th-TH')}</TableCell>
                    <TableCell className="text-right">฿{money(r.cost)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">฿{money(r.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Depreciation Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              ตารางคำนวณค่าเสื่อมราคาครุภัณฑ์
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดงรายการครุภัณฑ์พร้อมมูลค่าทุน ค่าเสื่อมราคาสะสม และมูลค่าสุทธิตามบัญชี
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            รวม {filtered.length} รายการ
          </span>
        </div>

        {filtered.length ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                    <TableHead className="font-bold">รหัสครุภัณฑ์</TableHead>
                    <TableHead className="font-bold">รายการครุภัณฑ์</TableHead>
                    <TableHead className="font-bold">วันที่ได้มา</TableHead>
                    <TableHead className="font-bold text-center">อายุใช้งาน</TableHead>
                    <TableHead className="font-bold text-center">อายุคงเหลือ</TableHead>
                    <TableHead className="font-bold text-right">ราคาทุน</TableHead>
                    <TableHead className="font-bold text-right">ค่าเสื่อมสะสม</TableHead>
                    <TableHead className="font-bold text-right">มูลค่าคงเหลือสุทธิ</TableHead>
                    <TableHead className="font-bold text-center">สภาพ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(page * 40, (page + 1) * 40).map(a => {
                    const bv = bookValue(a, asOfDate);
                    const netBook = bv !== null ? bv : a.totalSatang;
                    const accDep = bv !== null ? Math.max(0, a.totalSatang - bv) : 0;

                    return (
                      <TableRow
                        key={a.id}
                        className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                        onClick={() => select(a)}
                      >
                        <TableCell className="font-mono text-xs font-bold text-blue-700 select-all whitespace-nowrap">
                          {a.code}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-xs text-slate-900 line-clamp-1">{a.name}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">{a.branch || '—'}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {a.receivedDate ? thaiDateOnly(a.receivedDate) : '—'}
                        </TableCell>
                        <TableCell className="text-center text-xs text-slate-600 whitespace-nowrap">
                          {a.lifeYears ? `${a.lifeYears} ปี` : '—'}
                        </TableCell>
                        <TableCell className="text-center text-xs whitespace-nowrap">
                          {(() => {
                            const left = remainingLifeYears(a, asOfDate);
                            if (left === null) return <span className="text-slate-400">—</span>;
                            if (left === 0) return <span className="font-bold text-rose-600">ครบอายุ</span>;
                            return <span className="text-slate-700">{(Math.round(left * 10) / 10).toFixed(1)} ปี</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-xs text-slate-900 whitespace-nowrap">
                          ฿{money(a.totalSatang)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-rose-600 whitespace-nowrap">
                          {accDep > 0 ? `฿${money(accDep)}` : '0.00 ฿'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs text-emerald-700 whitespace-nowrap">
                          ฿{money(netBook)}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Badge value={a.condition} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                แสดงรายการที่ {page * 40 + 1} - {Math.min((page + 1) * 40, filtered.length)} จากทั้งหมด {filtered.length} รายการ
              </span>
              <Pager page={page} total={filtered.length} onChange={setPage} />
            </div>
          </>
        ) : (
          <Empty title="ไม่พบรายการครุภัณฑ์ตามตัวกรองนี้" />
        )}
      </div>
    </div>
  );
}
