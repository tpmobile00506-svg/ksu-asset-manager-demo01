import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Asset } from '../contracts/domain';
import {
  codeRange,
  commonValue,
  conditionCounts,
  groupRows,
  pieceFamilies,
  rowAssets,
} from '../../frontend/features/inventory/piece-groups';

// ครุภัณฑ์จำลอง: ใส่เฉพาะช่องที่การจัดแถวใช้
const asset = (id: string, parentId: string | null, extra: Partial<Asset> = {}) =>
  ({ id, code: id, parentId, condition: 'normal', ...extra }) as Asset;

// แม่ P มีลูกรายชิ้น 3 ชิ้น · แม่ S แยกรายการแบบเดิม ได้ลูก 2 ล็อต
const p1 = asset('P-1', 'P'),
  p2 = asset('P-2', 'P'),
  p3 = asset('P-3', 'P'),
  s1 = asset('S-1', 'S'),
  s2 = asset('S-2', 'S'),
  solo = asset('X', null);
const all = [solo, p1, s1, p2, s2, p3];

test('กลุ่มรายชิ้น: แม่ที่มีลูกตั้งแต่ 3 รายการ · แยกรายการแบบเดิม (ลูก 2 รายการ) ไม่นับ', () => {
  assert.deepEqual([...pieceFamilies(all)], ['P']);
});

test('จัดแถว: ชิ้นของกลุ่มเดียวกันรวมเป็นแถวเดียว วางตรงชิ้นแรก ล็อตแบบเดิมยังแยกแถว', () => {
  const rows = groupRows(all, pieceFamilies(all));
  // ลำดับเดิม: X, P-1, S-1, P-2, S-2, P-3 → X, [P-1 P-2 P-3], S-1, S-2
  assert.deepEqual(
    rows.map(r => (r.kind === 'group' ? `group:${r.items.map(a => a.id).join(',')}` : r.asset.id)),
    ['X', 'group:P-1,P-2,P-3', 'S-1', 'S-2'],
  );
  // เลือกทั้งหน้า = ทุกชิ้น รวมชิ้นในกลุ่มที่พับอยู่ (6 รายการ)
  assert.deepEqual(
    rowAssets(rows).map(a => a.id),
    ['X', 'P-1', 'P-2', 'P-3', 'S-1', 'S-2'],
  );
});

test('จัดแถว: ตัวกรองเหลือชิ้นของกลุ่มชิ้นเดียว แสดงเป็นแถวธรรมดา (เช่น ค้นหาเลขชิ้นตรงๆ)', () => {
  const rows = groupRows([p2], pieceFamilies(all));
  assert.deepEqual(rows, [{ kind: 'asset', asset: p2 }]);
  // เหลือ 2 ชิ้น ยังรวมเป็นกลุ่ม
  const two = groupRows([p1, p3], pieceFamilies(all));
  assert.equal(two.length, 1);
  assert.equal(two[0].kind, 'group');
});

test('ช่วงหมายเลข: ตัดส่วนหน้าที่ซ้ำ ตัดตรงตัวคั่นเท่านั้น และเรียงเลขแบบตัวเลข', () => {
  assert.equal(
    codeRange([{ code: 'CH-68-001-020(020)' }, { code: 'CH-68-001-001(020)' }, { code: 'CH-68-001-002(020)' }]),
    'CH-68-001-001(020) ถึง 020(020)',
  );
  // แบบ /1 /2 … /20: 20 ต้องมาหลัง 2 (เรียงแบบตัวเลข)
  assert.equal(codeRange([{ code: 'A/2' }, { code: 'A/20' }, { code: 'A/1' }]), 'A/1 ถึง 20');
  assert.equal(codeRange([{ code: 'K-1' }]), 'K-1');
  assert.equal(codeRange([]), '');
});

test('ค่าที่เหมือนกันทุกชิ้นแสดงค่านั้น · ต่างกันแสดง "หลาย…" · สภาพนับเรียงมากไปน้อย', () => {
  assert.equal(commonValue(['ห้อง 301', 'ห้อง 301'], 'หลายที่'), 'ห้อง 301');
  assert.equal(commonValue(['ห้อง 301', 'ห้อง 302'], 'หลายที่'), 'หลายที่');
  assert.deepEqual(conditionCounts([{ condition: 'damaged' }, { condition: 'normal' }, { condition: 'normal' }]), [
    ['normal', 2],
    ['damaged', 1],
  ]);
});
