import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getData } from '../services/asset-service';
import type { Member } from '../auth/sessions';
import { installMemoryDatabase } from './helpers/memory-db';

// ผู้อนุมัติต้องเห็นชื่อผู้ยื่นคำขอ (18 ต.ค. 2569): getData แนบชื่อจากตาราง users ให้ทุกคำขอ
const head: Member = {
  id: 'head-1',
  email: 'head@example.test',
  name: 'หัวหน้าสาขา',
  role: 'head',
  branch: 'วิศวกรรมคอมพิวเตอร์ (วค)',
  active: 1,
  createdAt: '',
};

test('คำขอแต่ละรายการมีชื่อผู้ยื่น · ผู้ยื่นที่ไม่พบในตาราง users ได้ค่าว่าง', async () => {
  const request = (id: string, actor: string) => ({
    id,
    assetId: 'a1',
    assetVersion: 2,
    kind: 'transfer',
    status: 'pending',
    reason: 'ย้ายห้อง',
    payload: '{}',
    chain: '["head","deputy","dean"]',
    stage: 0,
    version: 1,
    actor,
    createdAt: '2026-10-18T00:00:00.000Z',
    asset: { code: 'วค.01', name: 'คอมพิวเตอร์' },
  });
  const restore = installMemoryDatabase({
    asset: { findMany: async () => [] },
    assetRequest: { findMany: async () => [request('r1', 'staff-1'), request('r2', 'removed-user')] },
    stocktake: { findMany: async () => [] },
    // getData นับรายการในรอบตรวจนับด้วย groupBy (8 พ.ย. 2569) ฐานจำลองจึงต้องมีเมธอดนี้
    stocktakeItem: { groupBy: async () => [] },
    user: {
      findMany: async () => [
        { id: 'staff-1', name: 'งานพัสดุ คณะวิศวฯ' },
        { id: 'head-1', name: 'หัวหน้าสาขา' },
      ],
    },
    audit: { findMany: async () => [] },
    importFile: { findMany: async () => [] },
    storedFile: { findMany: async () => [] },
    sourceRow: { groupBy: async () => [] },
    setting: { findMany: async () => [] },
    approval: { findMany: async () => [] },
    assetSet: { findMany: async () => [] },
  });
  try {
    const data = (await getData(head, new URL('http://localhost/api/data'))) as {
      requests: Array<{ id: string; requesterName: string; code: string }>;
    };
    assert.deepEqual(
      data.requests.map(r => [r.id, r.requesterName, r.code]),
      [
        ['r1', 'งานพัสดุ คณะวิศวฯ', 'วค.01'],
        ['r2', '', 'วค.01'],
      ],
    );
  } finally {
    restore();
  }
});
