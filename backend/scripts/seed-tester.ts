// สร้าง/ตั้งรหัสผ่านใหม่ให้บัญชีผู้ทดสอบระบบ (tester) จาก TESTER_EMAIL / TESTER_PASSWORD (ห้ามใส่รหัสผ่านในโค้ด)
// รันซ้ำได้: ถ้ามีบัญชีผู้ทดสอบอยู่แล้วจะตั้งรหัสผ่านใหม่และออกจากระบบทุกเครื่อง · ไม่แตะบัญชีบทบาทอื่น
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma, checkDatabase, disconnectDatabase } from '../db/client';
import { hashPassword } from '../auth/sessions';

const email = process.env.TESTER_EMAIL?.trim().toLowerCase();
const password = process.env.TESTER_PASSWORD;
const name = process.env.TESTER_NAME?.trim() || 'ผู้ทดสอบระบบ (Tester)';
if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set TESTER_EMAIL and TESTER_PASSWORD before db:seed:tester');
try {
  await checkDatabase();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing && existing.role !== 'tester') throw new Error('TESTER_EMAIL belongs to a non-tester account; seed will not change its role');
    if (existing) {
      await tx.user.update({ where: { id: existing.id }, data: { name, active: 1, passwordHash } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
    } else {
      await tx.user.create({ data: { id: randomUUID(), email, name, role: 'tester', branch: null, active: 1, passwordHash, createdAt: new Date().toISOString() } });
    }
  }, { isolationLevel: 'Serializable' });
  console.log('Tester account ready.');
} finally {
  await disconnectDatabase();
}
