'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import type { Asset } from '@/shared/domain';

interface OverviewChartsProps {
  assets: Asset[];
  onSelectBranch?: (branch: string) => void;
}

// สีสถานะตามข้อกำหนด โดยเฉพาะ ชำรุด/รอจำหน่าย ให้เป็นสีเทา (#64748b)
const STATUS_COLORS = {
  normal: '#10b981',    // สีเขียวมรกต ปกติ/พร้อมใช้
  repair: '#f59e0b',    // สีเหลือง/ส้ม ส่งซ่อมบำรุง
  borrowed: '#3b82f6',  // สีน้ำเงิน ยืมใช้งานชั่วคราว
  damaged: '#64748b'    // สีเทา ชำรุด/รอจำหน่าย
};

function formatBranchShort(name: string): string {
  if (!name) return 'ทั่วไป';
  if (name.includes('คอมพิวเตอร์') || name.includes('วค')) return 'วศ.คอมฯ';
  if (name.includes('อุตสาหการ') || name.includes('วอ')) return 'วศ.อุตสาหการ';
  if (name.includes('ไฟฟ้า') || name.includes('วฟ')) return 'วศ.ไฟฟ้า';
  if (name.includes('เครื่องจักรกล') || name.includes('เครื่องกล') || name.includes('ศจก') || name.includes('วศศ')) return 'วศ.เครื่องกล';
  if (name.includes('คณบดี') || name.includes('สำนักงาน') || name.includes('สนง')) return 'สนง.คณบดี';
  return name.replace(/^สาขาวิชา(วิศวกรรม)?/, 'วศ.').slice(0, 10);
}

export default function OverviewCharts({ assets, onSelectBranch }: OverviewChartsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // คำนวณกราฟแท่งจากข้อมูลจริงในทะเบียน (เฉพาะรายการที่ถือครอง)
  const barData = useMemo(() => {
    const active = assets.filter(a => a.lifecycle === 'active');
    const branchMap: Record<string, { name: string; fullName: string; count: number }> = {};

    for (const a of active) {
      const branchName = a.branch?.trim() || 'ส่วนกลาง';
      const short = formatBranchShort(branchName);
      if (!branchMap[branchName]) {
        branchMap[branchName] = { name: short, fullName: branchName, count: 0 };
      }
      branchMap[branchName].count += (a.quantity || 1);
    }

    return Object.values(branchMap).sort((a, b) => b.count - a.count);
  }, [assets]);

  // คำนวณกราฟโดนัทจากข้อมูลสภาพจริงของครุภัณฑ์ในระบบ
  const { pieData, activeSlices, readyPercent } = useMemo(() => {
    const activeList = assets.filter(a => a.lifecycle === 'active');
    const total = activeList.reduce((sum, a) => sum + (a.quantity || 1), 0);

    const normal = activeList.filter(a => a.condition === 'normal').reduce((sum, a) => sum + (a.quantity || 1), 0);
    const repair = activeList.filter(a => a.condition === 'repair').reduce((sum, a) => sum + (a.quantity || 1), 0);
    const borrowed = activeList.filter(a => (a.condition as any) === 'borrowed' || (a.condition as any) === 'missing').reduce((sum, a) => sum + (a.quantity || 1), 0);
    const damaged = activeList.filter(a => a.condition === 'damaged' || a.lifecycle === 'disposed').reduce((sum, a) => sum + (a.quantity || 1), 0);

    const calcPercent = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');

    const list = [
      { key: 'normal', name: 'ปกติ/พร้อมใช้', value: normal, percentage: calcPercent(normal), color: STATUS_COLORS.normal },
      { key: 'repair', name: 'ส่งซ่อมบำรุง', value: repair, percentage: calcPercent(repair), color: STATUS_COLORS.repair },
      { key: 'borrowed', name: 'ไม่พบ', value: borrowed, percentage: calcPercent(borrowed), color: STATUS_COLORS.borrowed },
      { key: 'damaged', name: 'ชำรุด/รอจำหน่าย', value: damaged, percentage: calcPercent(damaged), color: STATUS_COLORS.damaged }
    ];

    const valid = list.filter(item => item.value > 0);

    return {
      pieData: list,
      activeSlices: valid.length ? valid : [{ key: 'empty', name: 'ไม่มีข้อมูล', value: 1, percentage: '0.0', color: '#e2e8f0' }],
      readyPercent: calcPercent(normal)
    };
  }, [assets]);

  if (!mounted) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 min-h-[360px] animate-pulse" />
        <div className="bg-white rounded-xl border border-slate-200 p-6 min-h-[360px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
      {/* 📊 การ์ดซ้าย: กราฟแท่งจำนวนครุภัณฑ์แยกตามสาขา (ข้อมูลจริง) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-slate-800 tracking-tight">
                จำนวนครุภัณฑ์ (ชิ้น) แยกตามสาขาวิชา / หน่วยงาน
              </h2>
              <p className="text-[12.5px] text-slate-500 mt-1">
                {barData.length
                  ? `จำแนกตาม ${barData.map(b => b.name).join(', ')}`
                  : 'จำแนกตามหน่วยงานและสาขาวิชาที่ถือครอง'}
              </p>
            </div>
          </div>

          <div className="h-[270px] w-full mt-4">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 25, right: 15, left: -15, bottom: 5 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0] && onSelectBranch) {
                      onSelectBranch(e.activePayload[0].payload.fullName);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11.5, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, (dataMax: number) => Math.max(dataMax + 1, 3)]}
                    tick={{ fontSize: 11.5, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(239, 68, 68, 0.05)' }}
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-md text-xs">
                            <p className="font-semibold text-slate-800">{item.fullName || item.name}</p>
                            <p className="text-blue-600 font-bold mt-1">
                              จำนวน: {item.count.toLocaleString()} ชิ้น
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={48}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                    label={({ x, y, width, value }: any) => (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) - 8}
                        fill="#2563eb"
                        textAnchor="middle"
                        fontSize={13}
                        fontWeight={600}
                      >
                        {value}
                      </text>
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                ยังไม่มีข้อมูลครุภัณฑ์ในระบบ
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🍩 การ์ดขวา: กราฟโดนัทสัดส่วนสถานะการใช้งาน (ข้อมูลจริง) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 tracking-tight">
              สัดส่วนสถานะการใช้งาน
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              จำแนกตามความพร้อมใช้งานและการบำรุงรักษา · นับเป็นชิ้น
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 mt-4 min-h-[270px]">
            {/* วงโดนัทและตัวเลขตรงกลาง */}
            <div className="sm:col-span-6 relative flex items-center justify-center h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        if (item.key === 'empty') return null;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-md text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span>{item.name}</span>
                            </div>
                            <p className="text-slate-600 mt-1 font-medium">
                              {item.value.toLocaleString()} ชิ้น ({item.percentage}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={activeSlices}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={activeSlices.length > 1 ? 2 : 0}
                    dataKey="value"
                  >
                    {activeSlices.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* ข้อความและ % ใจกลางวงโดนัท */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                <span className="text-[26px] font-bold text-slate-800 leading-none">
                  {readyPercent}%
                </span>
                <span className="text-[11.5px] text-slate-500 font-medium mt-1">
                  พร้อมใช้งาน
                </span>
              </div>
            </div>

            {/* แถบ Legend ข้อมูลด้านขวา */}
            <div className="sm:col-span-6 flex flex-col justify-center gap-3 pl-2 sm:pl-4">
              {pieData.map((item) => (
                <div key={item.key} className="flex items-start gap-2.5 text-xs">
                  <span
                    className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div>
                    <div className="text-slate-800 leading-tight">
                      <span className="font-medium">{item.name}: </span>
                      <span className="font-bold text-[13px]">{item.value.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      คิดเป็น {item.percentage}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
