import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Asset } from '../contracts/domain';
import type { WorkspaceData } from '../contracts/models';
import { RegistryView } from '../../frontend/features/inventory/registry-view';
import { useRegistry } from '../../frontend/features/inventory/use-registry';
import { NotificationBell } from '../../frontend/features/shell/notification-bell';
import { AppSidebar } from '../../frontend/features/shell/app-sidebar';
import { LoginScreen } from '../../frontend/features/auth/login-screen';
import { viewDescription } from '../../frontend/features/shell/navigation';
import { formatImportDate } from '../../frontend/utils/relative-date';
import { SidebarProvider } from '../../frontend/components/ui/sidebar';

// ส่วนต่าง ๆ ที่แยกออกจาก workspace.tsx (20 ต.ค. 2569): วาดเป็น HTML ฝั่งเซิร์ฟเวอร์ด้วยข้อมูลตัวอย่าง
// ตรวจว่าแสดงข้อมูลถูกที่ และตัวกรอง/การแบ่งหน้าใน useRegistry ทำงานเหมือนเดิม (ไม่ต้องล็อกอินหรือเปิดเบราว์เซอร์)

const noop = () => {};
const asset = (n: number, extra: Partial<Asset> = {}): Asset => ({
  id: 'a' + n,
  code: `PC-${String(n).padStart(3, '0')}`,
  name: 'คอมพิวเตอร์ ' + n,
  quantity: 1,
  unitSatang: 100_00,
  totalSatang: 100_00,
  notes: '',
  location: 'ห้อง 1',
  branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
  groupName: 'คอม',
  category: 'ครุภัณฑ์คอมพิวเตอร์',
  condition: 'normal',
  lifecycle: 'active',
  version: 1,
  parentId: null,
  sourceId: null,
  sourceRow: null,
  receivedDate: '',
  lifeYears: 0,
  salvageSatang: 0,
  serial: '',
  brand: '',
  custodian: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});

function registryHtml(assets: Asset[], setup?: (r: ReturnType<typeof useRegistry>) => void) {
  function Harness() {
    const registry = useRegistry(assets, 'registry');
    setup?.(registry);
    return createElement(RegistryView, {
      registry,
      assets,
      activeCount: assets.filter(a => a.lifecycle === 'active').length,
      awaiting: new Map(),
      editable: true,
      busy: false,
      open: noop,
      onSelect: noop,
      onScan: noop,
      onExport: noop,
      onOpenImports: noop,
    });
  }
  return renderToStaticMarkup(createElement(Harness));
}

test('หน้าทะเบียน: แสดงทีละ 40 รายการ เฉพาะทะเบียนที่ถือครอง และบอกจำนวนทั้งหมด', () => {
  const assets = [
    ...Array.from({ length: 45 }, (_, i) => asset(i + 1)),
    asset(99, { lifecycle: 'disposed', code: 'OLD-099' }),
  ];
  const html = registryHtml(assets);
  // ป้ายจำนวนหัวตาราง = 45 (ไม่รวมรายการที่จำหน่ายแล้ว)
  assert.match(html, /รายการครุภัณฑ์ <span class="badge ml-2">45<\/span>/);
  // หน้าแรกเรียงตามวันที่เพิ่ม (เท่ากันทุกตัว) แล้วตามรหัส: PC-001 … PC-040 อยู่ หน้าแรกไม่มี PC-041
  assert.ok(html.includes('PC-001'));
  assert.ok(html.includes('PC-040'));
  assert.equal(html.includes('PC-041'), false);
  assert.equal(html.includes('OLD-099'), false);
});

test('หน้าทะเบียน: ไม่มีรายการเลย → ข้อความว่างพร้อมปุ่มเปิดข้อมูลต้นฉบับ', () => {
  const html = registryHtml([]);
  assert.ok(html.includes('ยังไม่มีรายการที่ยืนยันเข้าทะเบียน'));
  assert.ok(html.includes('เปิดข้อมูลต้นฉบับ'));
});

test('กระดิ่งแจ้งเตือน: Staff เห็นจำนวนคำขอค้างรวมกับรอบตรวจนับที่เปิดอยู่', () => {
  const data = {
    me: { id: 'staff-1', role: 'staff', name: 'เจ้าหน้าที่', email: 's@example.test', active: 1, createdAt: '' },
    assets: [asset(1)],
    requests: [
      { id: 'r1', assetId: 'a1', status: 'pending', chain: '["head"]', stage: 0, actor: 'x' },
      { id: 'r2', assetId: 'a1', status: 'approved', chain: '["head"]', stage: 1, actor: 'x' },
    ],
    rounds: [{ id: 'k1', status: 'open', total: 10, checked: 4 }],
  } as unknown as WorkspaceData;
  const html = renderToStaticMarkup(createElement(NotificationBell, { data, onGo: noop }));
  assert.ok(html.includes('title="การแจ้งเตือน (2 รายการ)"'));
});

test('เมนูข้าง: หน้า "ผู้ใช้งานและสิทธิ์" เห็นเฉพาะ Admin และแสดงจำนวนคำขอค้าง', () => {
  const me = (role: string) =>
    ({ id: 'u', role, name: 'สมชาย ใจดี', email: 'u@example.test', active: 1, createdAt: '' }) as WorkspaceData['me'];
  const render = (role: string) =>
    renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(AppSidebar, { view: 'overview', onSelect: noop, pendingCount: 3, me: me(role) }),
      ),
    );
  assert.ok(render('admin').includes('ผู้ใช้งานและสิทธิ์'));
  assert.equal(render('staff').includes('ผู้ใช้งานและสิทธิ์'), false);
  assert.ok(render('staff').includes('>3</span>'));
});

test('หน้าล็อกอิน: แสดงข้อความ error ที่ส่งเข้ามา', () => {
  const html = renderToStaticMarkup(
    createElement(LoginScreen, {
      email: '',
      onEmail: noop,
      password: '',
      onPassword: noop,
      loggingIn: false,
      error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      onSubmit: noop,
    }),
  );
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('อีเมลหรือรหัสผ่านไม่ถูกต้อง'));
});

test('คำอธิบายใต้หัวข้อหน้า และวันที่แบบไทย', () => {
  assert.ok(viewDescription('registry', 1234).includes('(1,234 รายการ)'));
  assert.equal(viewDescription('ไม่มีหน้านี้', 0), '');
  // 1 ต.ค. 2569 = ค.ศ. 2026 → ปี พ.ศ. 2 หลักท้าย = 69 · วันที่รับแสดงเป็นบรรทัดรอง
  assert.equal(formatImportDate(undefined, '2026-10-01').main, '1 ต.ค. 2569');
  assert.equal(formatImportDate('2026-10-01T05:00:00.000Z', '2026-09-30').sub, 'รับ: 30 ก.ย. 2569');
  assert.deepEqual(formatImportDate(), { main: '—', sub: '' });
});
