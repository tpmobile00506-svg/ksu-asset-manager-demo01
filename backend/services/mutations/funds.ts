import { ApiError, clean, allow, now, id, audit } from '../asset-service';
import { type MutationContext } from './types';
import { fundName, fundIdsByName } from './helpers';

// คำสั่งของทุน / โครงการ

// ทุน / โครงการ: เจ้าหน้าที่สร้างทุนและเลือกครุภัณฑ์ใส่เอง (ไม่นับรายการที่อยู่ต่อลงมาเองอัตโนมัติ)
// fundSave = สร้าง/แก้ชื่อ · fundDelete = ลบทุน · fundAssign / fundUnassign = ใส่/เอาครุภัณฑ์ออกจากทุน
export async function fundAction({ tx, m, action, b }: MutationContext) {
  allow(m, ['staff', 'admin']);
  const fundOf = async (fundId: string) => {
    const f = await tx.assetSet.findUnique({ where: { id: fundId } });
    if (!f || f.kind !== 'fund') throw new ApiError('ไม่พบทุนนี้', 404);
    return f;
  };
  if (action === 'fundSave') {
    const name = fundName(clean(b.name ?? '', 500));
    if (!name) throw new ApiError('กรุณาระบุชื่อทุน / โครงการ');
    if (b.fundId) {
      const f = await fundOf(clean(b.fundId));
      await tx.assetSet.update({ where: { id: f.id }, data: { name } });
      await audit(tx, m, 'แก้ชื่อทุน', null, f, { ...f, name });
      return { ok: true, id: f.id };
    }
    // เทียบชื่อแบบไม่สนช่องว่างซ้อน (ชื่อหัวทุนจากไฟล์ต้นฉบับมีช่องว่างหลายช่อง)
    const same = (await fundIdsByName(tx)).get(name);
    if (same) return { ok: true, id: same, existing: true };
    const f = { id: 'fund-' + id(), name, kind: 'fund', createdAt: now() };
    await tx.assetSet.create({ data: f });
    await audit(tx, m, 'สร้างทุน', null, null, f);
    return { ok: true, id: f.id };
  }
  if (action === 'fundDelete') {
    const f = await fundOf(clean(b.fundId));
    const members = await tx.asset.findMany({ where: { fundId: f.id }, select: { id: true } });
    // ไม่เพิ่มเวอร์ชัน: ทุนไม่ได้แก้ผ่านฟอร์มแก้ไข และคำขอที่รออนุมัติผูกกับเวอร์ชันของครุภัณฑ์ (เพิ่มแล้วคำขอจะอนุมัติไม่ได้)
    await tx.asset.updateMany({ where: { fundId: f.id }, data: { fundId: null } });
    await tx.asset.updateMany({ where: { fundHintId: f.id }, data: { fundHintId: null } });
    await tx.assetSet.delete({ where: { id: f.id } });
    await audit(tx, m, 'ลบทุน', null, { ...f, assetIds: members.map(x => x.id) }, null);
    return { ok: true };
  }
  const ids: string[] = Array.isArray(b.assetIds)
    ? ([
        ...new Set(b.assetIds.filter((x: unknown) => typeof x === 'string').map((x: string) => clean(x, 100))),
      ] as string[])
    : [];
  if (!ids.length || ids.length > 5000) throw new ApiError('เลือกครุภัณฑ์อย่างน้อย 1 รายการ');
  const rows = await tx.asset.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, fundId: true, lifecycle: true },
  });
  if (rows.length !== ids.length) throw new ApiError('ไม่พบครุภัณฑ์บางรายการ กรุณาโหลดใหม่', 409);
  // ใส่/เอาออกจากทุนเพิ่มเวอร์ชันของครุภัณฑ์ ถ้ามีคำขอรออนุมัติ คำขอนั้นจะอนุมัติไม่ได้อีก จึงต้องรอให้คำขอเสร็จก่อน
  const busy = await tx.assetRequest.findFirst({
    where: { status: 'pending', assetId: { in: ids } },
    select: { assetId: true },
  });
  if (busy)
    throw new ApiError(
      'รายการ ' +
        rows.find(x => x.id === busy.assetId)!.code +
        ' มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อนเปลี่ยนทุน',
      409,
    );
  if (action === 'fundAssign') {
    const f = await fundOf(clean(b.fundId));
    const inactive = rows.find(x => x.lifecycle !== 'active');
    if (inactive) throw new ApiError('รายการ ' + inactive.code + ' ถูกแบ่งยอดหรือจำหน่ายแล้ว');
    const other = rows.find(x => x.fundId && x.fundId !== f.id);
    if (other) throw new ApiError('รายการ ' + other.code + ' อยู่ในทุนอื่นแล้ว ต้องเอาออกจากทุนเดิมก่อน', 409);
    const add = rows.filter(x => x.fundId !== f.id).map(x => x.id);
    if (add.length)
      await tx.asset.updateMany({ where: { id: { in: add } }, data: { fundId: f.id, version: { increment: 1 } } });
    await audit(tx, m, 'ใส่ครุภัณฑ์เข้าทุน', null, null, { fundId: f.id, fundName: f.name, assetIds: add });
    return { ok: true, count: add.length };
  }
  const remove = rows.filter(x => x.fundId);
  if (remove.length)
    await tx.asset.updateMany({
      where: { id: { in: remove.map(x => x.id) } },
      data: { fundId: null, version: { increment: 1 } },
    });
  await audit(
    tx,
    m,
    'เอาครุภัณฑ์ออกจากทุน',
    null,
    remove.map(x => ({ id: x.id, code: x.code, fundId: x.fundId })),
    null,
  );
  return { ok: true, count: remove.length };
}
