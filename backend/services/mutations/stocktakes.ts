import { json } from '../../db/client';
import { ApiError, clean, allow, now, id, audit } from '../asset-service';
import { trace } from '../../debug/trace';
import { type MutationContext } from './types';

// คำสั่งของการตรวจนับประจำปี

// เปิดรอบตรวจนับ: ถ่ายสำเนาครุภัณฑ์ที่ใช้งานทุกรายการไว้ในรอบ (snapshot) ใช้เทียบตอนนับ
export async function openRound({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const name = clean(b.name, 200),
    year = Number(b.year);
  if (!name || !Number.isInteger(year) || year < 2500 || year > 2800)
    throw new ApiError('ชื่อรอบหรือปีงบประมาณไม่ถูกต้อง');
  const assets = await tx.asset.findMany({ where: { lifecycle: 'active' } });
  if (!assets.length) throw new ApiError('ยังไม่มีทะเบียนครุภัณฑ์สำหรับตรวจนับ');
  const rid = id();
  await tx.stocktake.create({ data: { id: rid, name, year, createdAt: now() } });
  await tx.stocktakeItem.createMany({
    data: assets.map(a => ({
      id: rid + a.id,
      roundId: rid,
      assetId: a.id,
      snapshot: json({
        code: a.code,
        name: a.name,
        quantity: a.quantity,
        location: a.location,
        branch: a.branch,
        totalSatang: a.totalSatang,
      }),
    })),
  });
  await audit(tx, m, 'เปิดรอบตรวจนับ', null, null, { id: rid, name, year });
  return { ok: true, id: rid };
}

// บันทึกผลตรวจนับ 1 รายการ: ปกติ / ชำรุด / ไม่พบ / ไม่ตรง
export async function recordCheck({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  let result = clean(b.result);
  if (result === 'matched') result = 'normal';
  if (result === 'excess') result = 'mismatch';
  if (!['normal', 'damaged', 'missing', 'mismatch'].includes(result)) throw new ApiError('ผลตรวจไม่ถูกต้อง');
  const item = await tx.stocktakeItem.findUnique({ where: { id: clean(b.id) }, include: { round: true } });
  if (!item || item.round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรายการ');
  if (b.expectedCheckedAt !== null && (typeof b.expectedCheckedAt !== 'string' || !b.expectedCheckedAt))
    throw new ApiError('กรุณาโหลดรายการตรวจนับใหม่ก่อนบันทึก');
  if (item.checkedAt !== b.expectedCheckedAt)
    throw new ApiError('ผลตรวจนับเปลี่ยนแล้ว กรุณาโหลดรายการใหม่ก่อนบันทึก', 409);
  const quantity = Number(b.quantity),
    expected = JSON.parse(item.snapshot).quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647)
    throw new ApiError('จำนวนที่พบต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647');
  if (quantity > expected && result !== 'mismatch')
    throw new ApiError('พบจำนวนเกินทะเบียน กรุณาเลือกจำนวน / สถานที่ไม่ตรง');
  if (result === 'normal' && quantity !== expected) throw new ApiError('จำนวนไม่ตรงทะเบียน กรุณาเลือกข้อมูลไม่ตรง');
  if (result === 'missing' && quantity !== 0) throw new ApiError('ผลไม่พบต้องมีจำนวนที่พบเป็น 0');
  trace.ok(`บันทึกผลตรวจนับ: ${result} · พบ ${quantity} จากที่ทะเบียนมี ${expected}`);
  const checkedAt = new Date(Math.max(Date.now(), item.checkedAt ? Date.parse(item.checkedAt) + 1 : 0)).toISOString();
  await tx.stocktakeItem.update({
    where: { id: item.id },
    data: { result, quantity, notes: clean(b.reason ?? ''), actor: m.id, checkedAt },
  });
  await audit(tx, m, 'บันทึกตรวจนับ', item.assetId, item, { result, quantity }, clean(b.reason ?? ''));
  return { ok: true };
}

// ปิดรอบตรวจนับ: ต้องนับครบทุกรายการก่อน
export async function closeRound({ tx, m, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const rid = clean(b.id),
    round = await tx.stocktake.findUnique({ where: { id: rid } });
  if (!round || round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรอบ', 409);
  const remaining = await tx.stocktakeItem.count({ where: { roundId: rid, result: 'pending' } });
  if (remaining) throw new ApiError('ยังมีรายการไม่ได้ตรวจนับ ' + remaining + ' รายการ');
  await tx.stocktake.update({ where: { id: rid }, data: { status: 'closed', closedAt: now() } });
  await audit(tx, m, 'ปิดรอบตรวจนับ', null, null, { id: rid });
  return { ok: true };
}
