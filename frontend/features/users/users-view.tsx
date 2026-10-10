'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck, Plus, Search, UserCheck, Shield, Award, Crown, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Role, roles } from '@/shared/domain';
import { Pick, getInitials } from '@/frontend/components/common';
import type { WorkspaceData } from '@/shared/models';

const roleMeta: Record<
  Role,
  { label: string; desc: string; color: string; bg: string; border: string; icon: any }
> = {
  staff: {
    label: 'เจ้าหน้าที่พัสดุ (Staff)',
    desc: 'นำเข้า/ตรวจนับ/ดูแล',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: ShieldCheck
  },
  head: {
    label: 'หัวหน้าสาขา (Head)',
    desc: 'อนุมัติคำขอขั้นที่ 1',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: UserCheck
  },
  deputy: {
    label: 'รองคณบดี (Deputy)',
    desc: 'อนุมัติคำขอขั้นที่ 2',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Award
  },
  dean: {
    label: 'คณบดี (Dean)',
    desc: 'อนุมัติขั้นสุดท้าย',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: Crown
  },
  admin: {
    label: 'ผู้ดูแลระบบ (Admin)',
    desc: 'จัดการระบบ/สิทธิ์ทั้งหมด',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: Settings
  }
};

export default function UsersView({
  data,
  open,
  write
}: {
  data: Pick<WorkspaceData, 'me' | 'users' | 'invites' | 'settings'>;
  open: (k: string, a?: Record<string, unknown>) => void;
  write: (b: Record<string, unknown>) => Promise<unknown>;
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  if (data.me.role !== 'admin') return null;

  const combinedUsers = useMemo(() => {
    return [
      ...data.users,
      ...data.invites
        .filter(i => !data.users.some(u => u.email === i.email))
        .map(i => ({ ...i, id: i.email, invited: true, isOnline: false }))
    ];
  }, [data.users, data.invites]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { staff: 0, head: 0, deputy: 0, dean: 0, admin: 0 };
    for (const u of combinedUsers) {
      if (counts[u.role] !== undefined) counts[u.role]++;
    }
    return counts;
  }, [combinedUsers]);

  const filteredUsers = useMemo(() => {
    return combinedUsers.filter(u => {
      const matchSearch =
        (u.name + ' ' + u.email).toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const isActive = Boolean(u.active ?? 1);
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);
      return matchSearch && matchRole && matchStatus;
    });
  }, [combinedUsers, search, roleFilter, statusFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 5 Role Summary Cards matching desktop_7_users.svg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {(Object.keys(roleMeta) as Role[]).map(r => {
          const meta = roleMeta[r];
          const Icon = meta.icon;
          const count = roleCounts[r] || 0;

          return (
            <div
              key={r}
              className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-sm flex items-center gap-3"
            >
              <div
                className={`w-11 h-11 rounded-full ${meta.bg} flex items-center justify-center ${meta.color} shrink-0`}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-900 block truncate">
                  {meta.label.split(' ')[0]}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">{meta.desc}</span>
                <strong className={`text-sm font-bold ${meta.color} block mt-0.5`}>
                  {count} บัญชี
                </strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action / Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="ค้นหาชื่อ หรืออีเมลผู้ใช้งาน…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50/60 border-slate-200 focus:bg-white"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold">สิทธิ์:</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer"
            >
              <option value="all">ทุกสิทธิ์การใช้งาน</option>
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold">สถานะ:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer"
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ระงับการใช้งาน</option>
            </select>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => open('user')}
          className="h-9 px-3.5 text-xs font-bold bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-sm cursor-pointer"
        >
          <Plus size={15} className="mr-1" /> เพิ่มผู้ใช้งานใหม่
        </Button>
      </div>

      {/* User Table matching desktop_7_users.svg */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              รายชื่อผู้ใช้งานและบทบาทในระบบ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดงผู้ใช้ทั้งหมดที่ลงทะเบียนในระบบพร้อมสิทธิ์การเข้าถึงข้อมูล
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            ทั้งหมด {filteredUsers.length} บัญชี
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                <TableHead className="font-bold">ผู้ใช้งาน</TableHead>
                <TableHead className="font-bold">บทบาทและสิทธิ์</TableHead>
                <TableHead className="font-bold">สาขาสังกัด</TableHead>
                <TableHead className="font-bold text-center">สถานะบัญชี</TableHead>
                <TableHead className="font-bold text-right w-[120px]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map(u => {
                const roleKey = u.role as Role;
                const meta = roleMeta[roleKey] || roleMeta.staff;
                const initials = getInitials(u.name || u.email || 'U');
                const isActive = Boolean(u.active ?? 1);

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${meta.bg} ${meta.color} font-bold text-xs flex items-center justify-center shrink-0 border ${meta.border} leading-none`}
                        >
                          {initials}
                        </div>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 block">
                            {u.name || 'ไม่ระบุชื่อ'}
                          </strong>
                          <span className="text-[11px] text-slate-500 block">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${meta.bg} ${meta.color} border ${meta.border}`}
                      >
                        {roles[roleKey] || u.role}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-slate-700 font-medium">
                        {u.branch || '— ไม่ระบุ —'}
                      </span>
                    </TableCell>

                    <TableCell className="text-center whitespace-nowrap">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          เปิดใช้งาน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          ระงับการใช้งาน
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => open('user', { user: u })}
                        className="h-7 px-3 text-xs font-bold text-slate-700 hover:text-blue-600 border-slate-300"
                      >
                        แก้ไขสิทธิ์
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Approval Pipeline Configuration Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">สายอนุมัติสำหรับคำขอใหม่</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            กำหนดขั้นตอนการส่งต่อเอกสารคำขอเพื่อการพิจารณาอนุมัติตามลำดับสายบังคับบัญชา
          </p>
        </div>
        <div className="max-w-md">
          <Pick
            label="สายอนุมัติมาตรฐาน"
            value={data.settings.workflow || '["head","deputy","dean"]'}
            onChange={v => write({ action: 'workflow', chain: JSON.parse(v) })}
            options={[
              [
                JSON.stringify(['head', 'deputy', 'dean']),
                '3 ระดับ: หัวหน้าสาขาวิชา (Head) → รองคณบดี (Deputy) → คณบดี (Dean)'
              ],
              [JSON.stringify(['head', 'dean']), '2 ระดับ: หัวหน้าสาขาวิชา → คณบดี'],
              [JSON.stringify(['dean']), '1 ระดับ: คณบดีเท่านั้น']
            ]}
          />
        </div>
      </div>
    </div>
  );
}
