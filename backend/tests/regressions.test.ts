import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, normalizeBranch, splitAmounts, type Asset } from '../contracts/domain';
import { createAssetWorkbook } from '../../frontend/services/excel-export';

test('explicit branch wins over notes and overlapping abbreviations', () => {
  assert.equal(normalizeBranch('วคม', 'ห้องคอม', 'สำนักงาน'), 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)');
  assert.equal(normalizeBranch('วิศวกรรมเครื่องกล (วคม)', '', 'คอม'), 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)');
  assert.equal(normalizeBranch('ควอ.', 'ไฟฟ้า', 'สำนักงาน'), 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)');
  assert.equal(normalizeBranch('วอ.', '', ''), 'วิศวกรรมอุตสาหการ (วอ)');
  assert.equal(normalizeBranch('วค.', '', ''), 'วิศวกรรมคอมพิวเตอร์ (วค)');
  assert.equal(normalizeBranch('วศค.', 'คอม', 'คอม'), 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)');
  assert.equal(normalizeBranch('นอส', '', ''), 'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)');
  assert.equal(normalizeBranch('', 'สาขาวิศวกรรมไฟฟ้า', ''), 'วิศวกรรมไฟฟ้า (วฟ)');
});

// ไฟล์ "ตัวย่อของสาขาวิชา" ของเจ้าหน้าที่ (17 ต.ค. 2569): ชื่อสาขารุ่นก่อนที่ยังอยู่ในฐานข้อมูลต้องแปลงเป็นชื่อใหม่
test('ชื่อสาขารุ่นก่อนแปลงเป็นสาขาตามไฟล์ตัวย่อของเจ้าหน้าที่ และไม่เดาสาขาจากชื่อแผ่นงาน', () => {
  assert.equal(normalizeBranch('เทคโนโลยีเครื่องจักรกลเกษตร (คจก)', '', ''), 'วิศวกรรมเครื่องจักรกลเกษตร (คจก)');
  assert.equal(normalizeBranch('วิศวกรรมเครื่องกล (วคม/วศค)', '', ''), 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)');
  assert.equal(normalizeBranch('วิศวกรรมเมคคาทรอนิกส์ (มค)', '', ''), 'วิศวกรรมเครื่องกลและเมคคาทรอนิกส์ (วคม/วศค)');
  assert.equal(normalizeBranch('วิศวกรรมโยธา/โลจิสติกส์ (วย/วล)', '', ''), 'วิศวกรรมโลจิสติกส์และเทคโนโลยีขนส่ง (วล)');
  assert.equal(normalizeBranch('นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ/นอส)', '', ''), 'นวัตกรรมการออกแบบและสถาปัตยกรรม (ออกแบบ)');
  assert.equal(normalizeBranch('ส่วนกลาง / การศึกษา', '', ''), 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)');
  // แผ่น "คอม" คือประเภทครุภัณฑ์ ไม่ใช่สาขา: ไม่ระบุสาขา → สำนักงานคณบดี (ไม่ใช่ วค)
  assert.equal(normalizeBranch('', '', 'คอม'), 'สำนักงานคณะฯ / คณบดี (สนง.ควอ.)');
});

test('Excel preserves registered amounts after splitting and XLSX round-trip', async () => {
  const amounts = splitAmounts(3, 100, 1);
  const common = { name: 'ทดสอบยอด', unitSatang: 33, branch: 'ทดสอบ', location: 'ห้องทดสอบ',
    notes: '', category: 'ทดสอบ', groupName: 'ทั่วไป', lifecycle: 'active' };
  const assets = [
    { ...common, code: 'A', quantity: 1, totalSatang: amounts[0] },
    { ...common, code: 'B', quantity: 2, totalSatang: amounts[1] },
    { ...common, code: 'C', quantity: 2, totalSatang: 900 },
    { ...common, code: 'PARENT', lifecycle: 'split', quantity: 3, totalSatang: 100 },
  ] as Asset[];
  const workbook = await createAssetWorkbook(assets);
  const bytes = await workbook.xlsx.writeBuffer();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('F6').value, 0.33);
  assert.equal(sheet.getCell('F7').value, 0.67);
  assert.equal(sheet.getCell('F8').value, 9);
  assert.equal(sheet.getCell('B9').text.includes('PARENT'), false);
  assert.equal([6, 7, 8].reduce((n, row) => n + Math.round(Number(sheet.getCell('F' + row).value) * 100), 0), 1000);
});

test('duplicate codes without digits must require review before bulk import', () => {
  const rows = classify({ id: 'test', name: 'test', hash: '', sheets: [{ name: 'test', rows: [
    { row: 1, values: [1, 'ไม่มีหมายเลข', 'เครื่องแรก', 1, 100, 100] },
    { row: 2, values: [2, 'ไม่มีหมายเลข', 'เครื่องที่สอง', 1, 100, 100] },
  ] }] });
  assert.ok(rows.every(row => row.issueType === 'duplicate' && row.issue));
});

test('requests from a cleared session cannot return data or expire a new session', async () => {
  const { api, cancelApiRequests, SESSION_EXPIRED_EVENT } = await import('../../frontend/components/common');
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = new EventTarget();
  let expired = 0;
  events.addEventListener(SESSION_EXPIRED_EVENT, () => expired++);
  globalThis.window = events as unknown as Window & typeof globalThis;
  let resolveOld!: (value: Response) => void;
  try {
    globalThis.fetch = (() => new Promise<Response>(resolve => { resolveOld = resolve; })) as typeof fetch;
    const stale = api().catch(error => error);
    cancelApiRequests();
    resolveOld(Response.json({ error: 'expired previous session' }, { status: 401 }));
    assert.equal((await stale).name, 'AbortError');
    assert.equal(expired, 0);
    globalThis.fetch = (async () => Response.json({ me: { name: 'New user', role: 'staff' }, settings: {},
      assets: [], requests: [], rounds: [], users: [], invites: [], events: [], imports: [], approvals: [] })) as typeof fetch;
    assert.equal((await api()).me.name, 'New user');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as any).window;
    else globalThis.window = originalWindow;
    cancelApiRequests();
  }
});

test('image fetches respect both session cancellation and component cancellation', async () => {
  const { sessionFetch, cancelApiRequests } = await import('../../frontend/components/common');
  const originalFetch = globalThis.fetch;
  let resolveFetch!: (response: Response) => void;
  try {
    globalThis.fetch = (() => new Promise<Response>(resolve => { resolveFetch = resolve; })) as typeof fetch;
    const oldImage = sessionFetch('/api/asset-image?asset=old').catch(error => error);
    cancelApiRequests();
    resolveFetch(new Response('old image'));
    assert.equal((await oldImage).name, 'AbortError');
    const component = new AbortController();
    const switchedImage = sessionFetch('/api/asset-image?asset=switched', { signal: component.signal }).catch(error => error);
    component.abort();
    resolveFetch(new Response('switched image'));
    assert.equal((await switchedImage).name, 'AbortError');
    globalThis.fetch = (async () => new Response('new image')) as typeof fetch;
    assert.equal(await (await sessionFetch('/api/asset-image?asset=current')).text(), 'new image');
  } finally {
    globalThis.fetch = originalFetch;
    cancelApiRequests();
  }
});
