import { json } from '../../db/client';
import { publicUserFields, verifyPassword } from '../../auth/sessions';
import { ApiError, allow, now, id, audit } from '../asset-service';
import { validate, userMutationSchema, workflowMutationSchema, passwordChangeSchema } from '../../validation';
import { type MutationContext } from './types';

// คำสั่งของ Admin: จัดการบัญชีผู้ใช้ และสายอนุมัติ · คำสั่งของทุกคน: เปลี่ยนรหัสผ่านของตัวเอง

// สร้าง/แก้บัญชีผู้ใช้ (Admin เท่านั้น): บทบาท สาขา เปิด/ปิดบัญชี และตั้งรหัสผ่านใหม่
export async function saveUser({ tx, m, b, passwordHash }: MutationContext) {
  allow(m, ['admin']);
  const validatedUser = validate(userMutationSchema, b);
  const { email, role, name, branch } = validatedUser;
  const active = validatedUser.active ?? 1;
  const target = await tx.user.findUnique({ where: { email }, select: publicUserFields });
  if (target?.id === m.id && (role !== 'admin' || !active)) throw new ApiError('ไม่สามารถปิดสิทธิ์ Admin ของตนเอง');
  if (!target && !passwordHash) throw new ApiError('กรุณากำหนดรหัสผ่านสำหรับบัญชีใหม่อย่างน้อย 12 ตัวอักษร');
  const existingInvite = await tx.invite.findUnique({ where: { email } });
  const userBranch = branch !== undefined ? branch : (target?.branch ?? existingInvite?.branch ?? null);
  // หัวหน้าสาขาที่ไม่มีสาขาอนุมัติคำขอใดไม่ได้เลย (ถูกปฏิเสธทุกครั้ง) จึงต้องระบุสาขาตั้งแต่สร้าง/แก้บัญชี
  if (role === 'head' && !userBranch) throw new ApiError('หัวหน้าสาขาต้องระบุสาขาที่รับผิดชอบ');
  // users.branch อ้างอิงตาราง branches (FK): ฐานข้อมูลใหม่ที่ยังไม่มีแถวสาขานี้ต้องสร้างก่อน
  if (userBranch) await tx.branch.createMany({ data: [{ name: userBranch }], skipDuplicates: true });
  if (target) {
    await tx.user.update({
      where: { id: target.id },
      data: { role, name, branch: userBranch, active, ...(passwordHash ? { passwordHash } : {}) },
    });
    if (passwordHash || !active || role !== target.role) await tx.session.deleteMany({ where: { userId: target.id } });
  } else
    await tx.user.create({
      data: {
        id: id(),
        email,
        name,
        role,
        branch: userBranch,
        active,
        passwordHash: passwordHash!,
        createdAt: now(),
      },
    });
  await tx.invite.upsert({
    where: { email },
    create: { email, role, name, branch: userBranch, active },
    update: { role, name, branch: userBranch, active },
  });
  await audit(tx, m, 'จัดการสิทธิ์ผู้ใช้', null, target, {
    email,
    role,
    name,
    branch: userBranch,
    active,
    passwordChanged: !!passwordHash,
  });
  return { ok: true };
}

// ตั้งสายอนุมัติ (Admin เท่านั้น) เช่น ["head","deputy","dean"]
export async function saveWorkflow({ tx, m, b }: MutationContext) {
  allow(m, ['admin']);
  const validatedWorkflow = validate(workflowMutationSchema, b);
  const chain = validatedWorkflow.chain;
  await tx.setting.upsert({
    where: { key: 'workflow' },
    create: { key: 'workflow', value: json(chain) },
    update: { value: json(chain) },
  });
  await audit(tx, m, 'กำหนดสายอนุมัติ', null, null, chain);
  return { ok: true };
}

// เปลี่ยนรหัสผ่านของตัวเอง (ทุกบทบาท): ตรวจรหัสเดิมก่อน แล้วออกจากระบบทุกเครื่อง ให้เข้าใหม่ด้วยรหัสใหม่
// รหัสใหม่ถูก hash ไว้ก่อนเปิด transaction (passwordHash) เหมือนคำสั่ง user ไม่มีรหัสจริงในประวัติหรือในตาราง operations
export async function changeOwnPassword({ tx, m, b, passwordHash }: MutationContext) {
  const { currentPassword } = validate(passwordChangeSchema, b);
  if (!passwordHash) throw new ApiError('รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร');
  const user = await tx.user.findUnique({ where: { id: m.id }, select: { id: true, passwordHash: true } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash)))
    throw new ApiError('รหัสผ่านเดิมไม่ถูกต้อง');
  await tx.user.update({ where: { id: m.id }, data: { passwordHash } });
  await tx.session.deleteMany({ where: { userId: m.id } });
  await audit(tx, m, 'เปลี่ยนรหัสผ่านของตนเอง', null, null, { email: m.email });
  return { ok: true, signedOut: true };
}
