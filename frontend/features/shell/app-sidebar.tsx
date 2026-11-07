'use client';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { getInitials } from '@/frontend/components/common';
import type { WorkspaceData } from '@/frontend/types/models';
import { nav, canSeeView, type NavEntry } from './navigation';

// เมนูข้างซ้าย: โลโก้คณะ รายการหน้า และชื่อผู้ใช้ที่ล็อกอินอยู่
// หน้า "ผู้ใช้งาน" เห็นเฉพาะผู้ดูแลระบบ · หน้า "นำเข้า" เห็นเฉพาะเจ้าหน้าที่และผู้ดูแลระบบ (ดู canSeeView)
// บนมือถือเมนูเป็นลิ้นชัก กดเลือกหน้าแล้วปิดเอง
function NavList({
  items,
  view,
  onSelect,
  pendingCount,
  role,
}: {
  items: readonly NavEntry[];
  view: string;
  onSelect: (k: string) => void;
  pendingCount: number;
  role: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items
        .filter(x => canSeeView(x[0], role))
        .map(([key, label, Icon]) => (
          <SidebarMenuItem key={key}>
            <SidebarMenuButton
              className="nav-item"
              isActive={view === key}
              onClick={() => {
                onSelect(key);
                if (isMobile) setOpenMobile(false);
              }}
            >
              <Icon className={view === key ? 'text-blue-300' : 'text-slate-400'} />
              <span>{label}</span>
              {key === 'requests' && pendingCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  {pendingCount}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
    </SidebarMenu>
  );
}

export function AppSidebar({
  view,
  onSelect,
  pendingCount,
  me,
}: {
  view: string;
  onSelect: (view: string) => void;
  pendingCount: number;
  me: WorkspaceData['me'];
}) {
  return (
    <Sidebar>
      <SidebarHeader className="p-0 border-b border-slate-800/80">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-12 h-12 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-sm border border-slate-700/60 overflow-hidden">
            <img
              src="/logo-faculty.png"
              alt="คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <strong className="text-white text-[15px] font-bold block leading-tight truncate">ระบบครุภัณฑ์</strong>
            <small className="text-slate-300 text-xs block mt-0.5 font-medium truncate">คณะวิศวกรรมศาสตร์ฯ</small>
            <small className="text-slate-400 text-[10px] block leading-tight truncate">มหาวิทยาลัยกาฬสินธุ์</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <NavList
          items={nav as unknown as readonly NavEntry[]}
          view={view}
          onSelect={onSelect}
          pendingCount={pendingCount}
          role={me.role}
        />
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-slate-800/80">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/90 border border-slate-700/60">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm leading-none">
            {getInitials(me.name)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-xs font-bold text-slate-100 truncate">{me.name}</div>
            <div className="text-[10px] text-slate-400 truncate">{me.email}</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
