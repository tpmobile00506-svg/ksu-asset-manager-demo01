import type { Transaction } from '../db/client';
import type { Member } from '../auth/sessions';
import { ApiError, allow, audit, clean, overridesKey, archivedKey } from './asset-service';

// ลบ / เก็บเข้าคลังไฟล์ต้นฉบับ Excel (ผู้ใช้ขอ 17 ต.ค. 2569)
// - ยังไม่ได้นำเข้าเลยสักแถว → ลบได้จริง (เช่น อัปผิดไฟล์)
// - นำเข้าไปแล้ว → ลบไม่ได้ เพราะครุภัณฑ์ยังชี้กลับไปแถวต้นฉบับ (sourceId/sourceRow) ใช้ "เก็บเข้าคลัง" แทน
// สถานะคลังเก็บเป็นไฟล์เครื่องหมายใน stored_files (archivedKey) แบบเดียวกับ overrides

export const importFileActions = ['sourceDelete', 'sourceArchive'] as const;
export type ImportFileAction = typeof importFileActions[number];
export const isImportFileAction = (action: string): action is ImportFileAction => (importFileActions as readonly string[]).includes(action);

// จำนวนแถวที่นำเข้าทะเบียนแล้วจากไฟล์นี้ (นับทั้งที่บันทึกการตัดสินใจไว้ และครุภัณฑ์ที่อ้างถึงไฟล์)
async function usage(tx: Transaction, sourceId: string) {
  const [decided, assets] = await Promise.all([
    tx.sourceRow.count({ where: { sourceId } }),
    tx.asset.count({ where: { sourceId } }),
  ]);
  return Math.max(decided, assets);
}

export async function importFileAction(tx: Transaction, m: Member, action: ImportFileAction, b: Record<string, unknown>) {
  allow(m, ['staff', 'admin']);
  const sourceId = clean(b.sourceId);
  const file = /^[a-zA-Z0-9-]+$/.test(sourceId) ? await tx.importFile.findUnique({ where: { id: sourceId } }) : null;
  if (!file) throw new ApiError('ไม่พบไฟล์ต้นฉบับ กรุณาโหลดใหม่', 404);

  if (action === 'sourceDelete') {
    const used = await usage(tx, sourceId);
    if (used) throw new ApiError(`ไฟล์นี้นำเข้าทะเบียนไปแล้ว ${used.toLocaleString('th-TH')} แถว จึงลบไม่ได้ ใช้ "เก็บเข้าคลัง" แทน`, 409);
    await tx.storedFile.deleteMany({ where: { key: { in: [file.objectKey, file.objectKey + '.json', overridesKey(sourceId), archivedKey(sourceId)] } } });
    await tx.importFile.delete({ where: { id: sourceId } });
    await audit(tx, m, 'ลบไฟล์ต้นฉบับ', null, { id: file.id, name: file.name, rows: file.rowCount }, null);
    return { ok: true };
  }

  const archived = b.archived === true;
  if (archived) {
    await tx.storedFile.createMany({ data: [{ key: archivedKey(sourceId), body: Buffer.from(JSON.stringify({ at: new Date().toISOString(), by: m.id }), 'utf8') }], skipDuplicates: true });
  } else {
    await tx.storedFile.deleteMany({ where: { key: archivedKey(sourceId) } });
  }
  await audit(tx, m, archived ? 'เก็บไฟล์ต้นฉบับเข้าคลัง' : 'นำไฟล์ต้นฉบับออกจากคลัง', null, null, { id: file.id, name: file.name });
  return { ok: true };
}
