import { createHash } from 'node:crypto';
import { prisma, json, Prisma, isWriteConflict, writeConflictDelay } from '../../db/client';
import { freshMember, hashPassword, passwordFingerprint, type Member } from '../../auth/sessions';
import { type Candidate, classify } from '../../contracts/domain';
import { ApiError, clean, allow, now, id, getSource, loadOverrides } from '../asset-service';
import { trace } from '../../debug/trace';
import { type Input, type MutationContext, type Handler } from './types';
import { importFileAction } from './import-files';
import { saveUser, saveWorkflow, changeOwnPassword } from './users';
import { createAsset, bulkEdit, editAsset, splitAsset, repairComplete, voidAsset, restoreAsset } from './assets';
import { batchImport, rowOverride } from './imports';
import { fundAction } from './funds';
import { createRequest, decideRequest, cancelRequest } from './requests';
import { openRound, recordCheck, closeRound } from './stocktakes';

// ชนกับคำขอของคนอื่นพร้อมกัน: ลองใหม่ได้สูงสุดกี่รอบ (รวมรอบแรก) ก่อนแจ้งผู้ใช้ให้ลองใหม่เอง
const MAX_ATTEMPTS = 5;

// ตารางคำสั่ง: ชื่อ action ที่หน้าเว็บส่งมา → ฟังก์ชันที่ทำงานนั้น
// เพิ่มคำสั่งใหม่ = เขียนฟังก์ชันในไฟล์ของเรื่องนั้น แล้วเพิ่มบรรทัดในตารางนี้
const handlers: Record<string, Handler> = {
  // บัญชีและการตั้งค่า (users.ts)
  user: saveUser,
  workflow: saveWorkflow,
  password: changeOwnPassword,
  // ทะเบียนครุภัณฑ์ (assets.ts)
  create: createAsset,
  import: createAsset,
  bulkEdit,
  edit: editAsset,
  split: splitAsset,
  repairComplete,
  void: voidAsset,
  restore: restoreAsset,
  // นำเข้า Excel (imports.ts, import-files.ts)
  batchImport,
  rowOverride,
  sourceDelete: ctx => importFileAction(ctx.tx, ctx.m, 'sourceDelete', ctx.b),
  sourceArchive: ctx => importFileAction(ctx.tx, ctx.m, 'sourceArchive', ctx.b),
  // ทุน / โครงการ (funds.ts)
  fundSave: fundAction,
  fundDelete: fundAction,
  fundAssign: fundAction,
  fundUnassign: fundAction,
  // คำขอและการอนุมัติ (requests.ts)
  request: createRequest,
  approve: decideRequest,
  reject: decideRequest,
  cancelRequest,
  // ตรวจนับประจำปี (stocktakes.ts)
  round: openRound,
  check: recordCheck,
  closeRound,
};

// คำสั่งบันทึกข้อมูลทุกอย่างเข้าทางนี้ (POST /api/data): ตรวจรูปแบบ → เปิด transaction แบบ Serializable
// → อ่านผู้ใช้สด → กันกดซ้ำด้วย token → ส่งต่อให้ handler → เก็บผลลัพธ์คู่กับ token → ชนกันเมื่อไหร่ลองใหม่
export async function mutate(member: Member, input: Input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');
  const action = clean(input.action, 50),
    token = clean(input.token || id(), 100);
  let passwordHash: string | undefined, fingerprint: string | undefined;
  if (action === 'user' && input.password) {
    // ตรวจสิทธิ์ก่อนคำนวณ scrypt (ใช้ CPU มาก) ไม่ให้ผู้ใช้ที่ไม่ใช่ Admin ส่งรหัสผ่านมาให้เซิร์ฟเวอร์คำนวณได้ฟรี
    allow(member, ['admin']);
    trace.step('เข้ารหัสรหัสผ่านใหม่ด้วย scrypt ก่อนเก็บ (ไม่เก็บรหัสจริง)');
    passwordHash = await hashPassword(input.password);
    fingerprint = await passwordFingerprint(input.password, token);
  }
  // เปลี่ยนรหัสผ่านของตัวเอง: ทุกคนที่ล็อกอินแล้วทำได้ ลายนิ้วมือรวมรหัสเดิมด้วย กดซ้ำด้วยค่าเดิมจึงได้ผลเดิม
  if (action === 'password' && typeof input.password === 'string' && typeof input.currentPassword === 'string') {
    trace.step('เข้ารหัสรหัสผ่านใหม่ด้วย scrypt ก่อนเก็บ (ไม่เก็บรหัสจริง)');
    passwordHash = await hashPassword(input.password);
    fingerprint = await passwordFingerprint(input.currentPassword + ' ' + input.password, token);
  }
  // รหัสผ่านจริงไม่เข้า requestHash: แทนด้วยลายนิ้วมือ scrypt จึงยังแยกได้ว่าส่งซ้ำด้วยรหัสผ่านเดิมหรือไม่
  const { password: _password, currentPassword: _currentPassword, ...hashedInput } = input;
  const requestHash = createHash('sha256')
    .update(json(fingerprint ? { ...hashedInput, password: fingerprint } : hashedInput))
    .digest('hex');
  const replay = (existing: { actor: string; requestHash: string; response: string }) => {
    if (existing.actor !== member.id || (existing.requestHash && existing.requestHash !== requestHash))
      throw new ApiError('รหัสคำขอนี้ใช้กับข้อมูลอื่นแล้ว กรุณาเปิดฟอร์มใหม่', 409);
    trace.warn('token นี้เคยบันทึกแล้ว (กดซ้ำ) → ส่งผลลัพธ์เดิมกลับ ไม่บันทึกซ้ำ');
    return { ...JSON.parse(existing.response), ok: true, replayed: true };
  };
  let sourceRows: Candidate[] | undefined;
  if (action === 'import' || action === 'batchImport') {
    allow(await freshMember(prisma, member), ['staff', 'admin']);
    // Uploaded sources are immutable. Read and classify them before holding a
    // transaction connection; mutable import decisions are still checked below.
    sourceRows = classify(await getSource(clean(input.sourceId)), await loadOverrides(clean(input.sourceId)));
  }
  // Version/pending checks and writes must share a serializable snapshot.
  const isolationLevel: Prisma.TransactionIsolationLevel = 'Serializable';
  // Serializable อาจยกเลิก transaction ที่ทำพร้อมกันแม้แก้คนละรายการ เช่น 2 คนเพิ่มครุภัณฑ์พร้อมกัน
  // ซึ่งต่างก็อ่านรหัสทั้งทะเบียนเพื่อตรวจรหัสซ้ำ: ทุกอย่างถูกย้อนกลับแล้ว จึงลองใหม่ได้อย่างปลอดภัย (ดู isWriteConflict)
  for (let attempt = 1; ; attempt++) {
    if (attempt === 1)
      trace.step('เปิด transaction แบบ Serializable — ทุกขั้นต่อจากนี้ต้องสำเร็จพร้อมกัน ถ้าพลาดจะยกเลิกทั้งหมด');
    else trace.warn(`ชนกับคำสั่งของคนอื่นที่ทำพร้อมกัน → ฐานข้อมูลยกเลิกให้แล้ว ลองใหม่ครั้งที่ ${attempt}`);
    try {
      return await prisma.$transaction(
        async tx => {
          const m = await freshMember(tx, member);
          const existing = await tx.operation.findUnique({ where: { id: token } });
          if (existing) return replay(existing);
          const result = await perform({
            tx,
            m,
            action,
            b: input,
            passwordHash,
            sourceRows: sourceRows && structuredClone(sourceRows),
          });
          trace.ok('ทำคำสั่งเสร็จ → เก็บ token กับผลลัพธ์ไว้ ถ้ากดซ้ำจะได้ผลเดิม');
          await tx.operation.create({
            data: { id: token, valid: 1, actor: m.id, createdAt: now(), requestHash, response: json(result) },
          });
          return result;
        },
        { isolationLevel, maxWait: 15000, timeout: 45000 },
      );
    } catch (error) {
      const conflict = isWriteConflict(error);
      // A concurrent identical request may have committed while this transaction rolled back.
      if (conflict || (error as { code?: string }).code === 'P2002') {
        const existing = await prisma.operation.findUnique({ where: { id: token } });
        if (existing) return replay(existing);
      }
      if (conflict && attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, writeConflictDelay(attempt)));
        continue;
      }
      throw error;
    }
  }
}

function perform(ctx: MutationContext) {
  const handler = Object.hasOwn(handlers, ctx.action) ? handlers[ctx.action] : undefined;
  if (!handler) throw new ApiError('ไม่พบการทำงานนี้', 404);
  return handler(ctx);
}
