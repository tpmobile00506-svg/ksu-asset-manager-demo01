'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck, Plus, Search, UserCheck, Award, Crown, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Role, roles, approvalChainOf } from '@/shared/domain';
import { Pick, getInitials } from '@/frontend/components/common';
import type { WorkspaceData } from '@/shared/models';

// หน้าผู้ใช้งาน (ผู้ดูแลระบบเท่านั้น): จำนวนบัญชีตามบทบาท → รายชื่อ → สายอนุมัติ
// จอมือถือรายชื่อเป็นการ์ด ปุ่มแก้ไขอยู่ในการ์ด (เดิมตารางกว้างจนปุ่มแก้ไขอยู่นอกจอ)
const roleMeta: Record<Role, { desc: string; color: string; bg: string; border: string; icon: any }> = {
  staff: {
    desc: 'นำเข้า ตรวจนับ ยื่นคำขอ',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: ShieldCheck,
  },
  head: {
    desc: 'อนุมัติคำขอของสาขาตัวเอง',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: UserCheck,
  },
  deputy: {
    desc: 'อนุมัติคำขอระดับคณะ',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Award,
  },
  dean: {
    desc: 'อนุมัติขั้นสุดท้าย',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: Crown,
  },
  admin: {
    desc: 'จัดการบัญชีและตั้งค่า (อนุมัติคำขอไม่ได้)',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: Settings,
  },
};

// สายอนุมัติที่เลือกได้ · ชื่อบทบาทมาจาก roles (ภาษาไทยล้วน)
const chainOptions: [string, string][] = [
  [JSON.stringify(['head', 'deputy', 'dean']), `3 ขั้น: ${roles.head} → ${roles.deputy} → ${roles.dean}`],
  [JSON.stringify(['head', 'dean']), `2 ขั้น: ${roles.head} → ${roles.dean}`],
  [JSON.stringify(['dean']), `1 ขั้น: ${roles.dean}เท่านั้น`],
];

export default function UsersView({
  data,
  open,
  write,
}: {
  data: Pick<WorkspaceData, 'me' | 'users' | 'invites' | 'settings'>;
  open: (k: string, a?: Record<string, unknown>) => void;
  write: (b: Record<string, unknown>) => Promise<unknown>;
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // สายอนุมัติที่ใช้จริง (ค่าที่บันทึกไว้เสีย เช่น "[]" ระบบใช้ค่าเริ่มต้นแทน)
  const workflow = approvalChainOf(data.settings.workflow);
  const savedChain = JSON.stringify(workflow.chain);
  // เลือกแล้วยังไม่บันทึกจนกว่าจะกดปุ่ม (เดิมเลือกแล้วบันทึกทันที กดพลาดก็เปลี่ยนสายอนุมัติทั้งคณะ)
  const [chainDraft, setChainDraft] = useState<string | null>(null);
  const [savingChain, setSavingChain] = useState(false);
  const chainValue = chainDraft ?? savedChain;
  const chainChanged = chainValue !== savedChain || (!workflow.valid && !!data.settings.workflow);

  const combinedUsers = useMemo(() => {
    return [
      ...data.users,
      ...data.invites
        .filter(i => !data.users.some(u => u.email === i.email))
        .map(i => ({ ...i, id: i.email, invited: true, isOnline: false })),
    ];
  }, [data.users, data.invites]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(Object.keys(roles).map(r => [r, 0]));
    for (const u of combinedUsers) {
      if (counts[u.role] !== undefined) counts[u.role]++;
    }
    return counts;
  }, [combinedUsers]);

  const filteredUsers = useMemo(() => {
    return combinedUsers.filter(u => {
      const matchSearch = (u.name + ' ' + u.email).toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const isActive = Boolean(u.active ?? 1);
      const matchStatus =
        statusFilter === 'all' || (statusFilter === 'active' && isActive) || (statusFilter === 'inactive' && !isActive);
      return matchSearch && matchRole && matchStatus;
    });
  }, [combinedUsers, search, roleFilter, statusFilter]);

  // ตรวจบทบาทหลังเรียก hook ครบแล้ว: React ต้องเรียก hook ลำดับเดิมทุกครั้งที่วาดหน้า (กฎ Rules of Hooks)
  if (data.me.role !== 'admin') return null;

  const statusBadge = (isActive: boolean) =>
    isActive ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        เปิดใช้งาน
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        ระงับการใช้งาน
      </span>
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* จำนวนบัญชีตามบทบาท: มือถือเป็นแถบสั้น ไม่ดันรายชื่อลงไปใต้จอ · จอกว้างเป็นการ์ด */}
      <div className="flex flex-wrap gap-2 sm:hidden">
        {(Object.keys(roleMeta) as Role[]).map(r => (
          <span
            key={r}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${roleMeta[r].bg} ${roleMeta[r].color} ${roleMeta[r].border}`}
          >
            {roles[r]} {roleCounts[r] || 0}
          </span>
        ))}
      </div>
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {(Object.keys(roleMeta) as Role[]).map(r => {
          const meta = roleMeta[r];
          const Icon = meta.icon;
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
                <span className="text-xs font-bold text-slate-900 block truncate">{roles[r]}</span>
                <span className="text-[10px] text-slate-600 block truncate" title={meta.desc}>
                  {meta.desc}
                </span>
                <strong className={`text-sm font-bold ${meta.color} block mt-0.5`}>{roleCounts[r] || 0} บัญชี</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* ค้นหาและตัวกรอง */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-[1_1_14rem] min-w-0 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="ค้นหาชื่อหรืออีเมล"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50/60 border-slate-200 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold">บทบาท:</span>
            <select
              aria-label="บทบาท"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer"
            >
              <option value="all">ทุกบทบาท</option>
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="font-bold">สถานะ:</span>
            <select
              aria-label="สถานะบัญชี"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent font-medium text-slate-900 border-none outline-none cursor-pointer"
            >
              <option value="all">ทุกสถานะ</option>
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
          <Plus size={15} className="mr-1" /> เพิ่มผู้ใช้
        </Button>
      </div>

      {/* รายชื่อผู้ใช้ */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">ผู้ใช้งาน</h2>
          <span className="text-xs text-slate-600 font-medium">{filteredUsers.length} บัญชี</span>
        </div>

        {/* มือถือ: การ์ด */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredUsers.map(u => {
            const roleKey = u.role as Role;
            const meta = roleMeta[roleKey] || roleMeta.staff;
            return (
              <div key={u.id} className="p-4 flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${meta.bg} ${meta.color} font-bold text-xs flex items-center justify-center shrink-0 border ${meta.border} leading-none`}
                >
                  {getInitials(u.name || u.email || 'U')}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm font-bold text-slate-900 block">{u.name || 'ไม่ระบุชื่อ'}</strong>
                  <span className="text-xs text-slate-600 block break-all">{u.email}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${meta.bg} ${meta.color} border ${meta.border}`}
                    >
                      {roles[roleKey] || u.role}
                    </span>
                    {statusBadge(Boolean(u.active ?? 1))}
                  </div>
                  <span className="text-xs text-slate-600 block mt-1.5">{u.branch || 'ไม่ระบุสาขา'}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => open('user', { user: u })}
                  className="h-10 px-4 text-sm font-bold text-slate-700 border-slate-300 shrink-0"
                >
                  แก้ไข
                </Button>
              </div>
            );
          })}
        </div>

        {/* จอกว้าง: ตาราง */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 text-slate-600 text-xs">
                <TableHead className="font-bold">ผู้ใช้</TableHead>
                <TableHead className="font-bold">บทบาท</TableHead>
                <TableHead className="font-bold">สาขา/หน่วยงาน</TableHead>
                <TableHead className="font-bold text-center">สถานะ</TableHead>
                <TableHead className="font-bold text-right w-[110px]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map(u => {
                const roleKey = u.role as Role;
                const meta = roleMeta[roleKey] || roleMeta.staff;
                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${meta.bg} ${meta.color} font-bold text-xs flex items-center justify-center shrink-0 border ${meta.border} leading-none`}
                        >
                          {getInitials(u.name || u.email || 'U')}
                        </div>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 block">{u.name || 'ไม่ระบุชื่อ'}</strong>
                          <span className="text-[11px] text-slate-600 block">{u.email}</span>
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
                      <span className="text-xs text-slate-700 font-medium">{u.branch || 'ไม่ระบุ'}</span>
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {statusBadge(Boolean(u.active ?? 1))}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => open('user', { user: u })}
                        className="h-8 px-3 text-xs font-bold text-slate-700 hover:text-blue-600 border-slate-300"
                      >
                        แก้ไข
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* สายอนุมัติ: เลือกแล้วกดบันทึก */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">สายอนุมัติสำหรับคำขอใหม่</h2>
          <p className="text-xs text-slate-600 mt-0.5">มีผลกับคำขอที่ยื่นหลังบันทึก คำขอที่รออยู่ใช้สายเดิมจนจบ</p>
        </div>
        <div className="max-w-md space-y-3">
          <Pick label="สายอนุมัติ" value={chainValue} onChange={setChainDraft} options={chainOptions} />
          {!workflow.valid && data.settings.workflow && (
            <p className="text-xs text-amber-800">
              ค่าที่บันทึกไว้ไม่ถูกต้อง ระบบใช้ 3 ขั้น (ค่าเริ่มต้น) แทน กรุณาเลือกแล้วกดบันทึกใหม่
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!chainChanged || savingChain}
              onClick={async () => {
                setSavingChain(true);
                try {
                  if (await write({ action: 'workflow', chain: JSON.parse(chainValue) })) setChainDraft(null);
                } finally {
                  setSavingChain(false);
                }
              }}
              className="h-10 bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            >
              {savingChain ? 'กำลังบันทึก…' : 'บันทึกสายอนุมัติ'}
            </Button>
            {chainDraft !== null && chainDraft !== savedChain && (
              <Button variant="outline" className="h-10" onClick={() => setChainDraft(null)} disabled={savingChain}>
                คืนค่าเดิม
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
