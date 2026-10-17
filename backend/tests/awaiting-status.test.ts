import assert from 'node:assert/strict';
import { test } from 'node:test';
import { awaitingApprovalByAsset } from '../contracts/domain';

// ป้าย "รออนุมัติ…" แทนสภาพระหว่างมีคำขอค้าง (ผู้ใช้เลือก 18 ต.ค. 2569) · ค่าคาดหวังเขียนมือ
const CHAIN = JSON.stringify(['head', 'deputy', 'dean']);
const req = (over: Record<string, unknown>) => ({ assetId: 'a1', kind: 'repair', status: 'pending', stage: 0, chain: CHAIN, payload: '{}', requestNo: 'REQ-2570-0001', ...over }) as {
  assetId: string; kind: string; status: string; stage: number; chain: string; payload: string; requestNo?: string };
const assets = [{ id: 'a1' }, { id: 'a2', setId: 's1' }, { id: 'a3', setId: 's1' }, { id: 'a4', setId: 's1' }, { id: 'a5' }];

test('แจ้งซ่อมรอหัวหน้าสาขา → "รออนุมัติซ่อม" พร้อมเลขคำขอและขั้น 1/3', () => {
  const m = awaitingApprovalByAsset([req({})], assets);
  assert.deepEqual(m.get('a1'), { label: 'รออนุมัติซ่อม', detail: 'REQ-2570-0001 · รอหัวหน้าสาขา (ขั้น 1/3)' });
  assert.equal(m.size, 1);
});

test('คำขอที่อนุมัติแล้วหรือไม่อนุมัติ → ไม่มีป้าย (กลับไปแสดงสภาพจริง)', () => {
  assert.equal(awaitingApprovalByAsset([req({ status: 'approved' }), req({ status: 'rejected' })], assets).size, 0);
});

test('จำหน่ายรอคณบดี → "รออนุมัติจำหน่าย" ขั้น 3/3 · โอนย้ายสายอนุมัติขั้นเดียว → ขั้น 1/1', () => {
  assert.deepEqual(awaitingApprovalByAsset([req({ kind: 'disposal', stage: 2 })], assets).get('a1'),
    { label: 'รออนุมัติจำหน่าย', detail: 'REQ-2570-0001 · รอคณบดี (ขั้น 3/3)' });
  assert.deepEqual(awaitingApprovalByAsset([req({ kind: 'transfer', chain: '["dean"]', requestNo: undefined })], assets).get('a1'),
    { label: 'รออนุมัติโอนย้าย', detail: 'รอคณบดี (ขั้น 1/1)' });
});

test('โอนย้ายทั้งชุด → ทุกรายการในชุด s1 (3 รายการ) ได้ป้าย · ส่งซ่อมชิ้นเดียวในชุด → เฉพาะชิ้นนั้น', () => {
  const set = awaitingApprovalByAsset([req({ assetId: 'a2', kind: 'transfer', payload: '{"setId":"s1"}' })], assets);
  assert.deepEqual([...set.keys()].sort(), ['a2', 'a3', 'a4']);
  assert.equal(set.get('a4')?.label, 'รออนุมัติโอนย้าย');
  const one = awaitingApprovalByAsset([req({ assetId: 'a3', kind: 'repair', payload: '{"setId":"s1"}' })], assets);
  assert.deepEqual([...one.keys()], ['a3']);
});
