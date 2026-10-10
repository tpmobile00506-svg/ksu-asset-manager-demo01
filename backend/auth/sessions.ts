import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { prisma, checkDatabase, type Transaction } from '../db/client';
import { settings } from '../config/env';
import { ApiError } from '../services/errors';
import type { Role } from '../contracts/domain';
import { loginSchema } from '../validation/auth';

const scrypt = promisify(derive), COOKIE = 'ksu_session';
const duration = 8 * 60 * 60;
export const publicUserFields = { id: true, email: true, name: true, role: true, branch: true, active: true, createdAt: true } as const;
export type Member = { id: string; email: string; name: string; role: Role; branch?: string | null; active: number; createdAt: string };
export function passwordValid(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new ApiError('รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร');
  }
}
export async function hashPassword(password: string) {
  passwordValid(password);
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, hash: string) {
  const parts = hash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const key = await scrypt(password, parts[1], 64) as Buffer;
  return timingSafeEqual(Buffer.from(parts[2], 'hex'), key);
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const dummyHash = hashPassword('dummy-password-hash');
export function cookieValue(request: Request): string | null {
  const value = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function sessionCookie(token: string, maxAge = duration) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${settings.secureCookies || settings.frontendOrigin.startsWith('https:') ? '; Secure' : ''}`;
}
export async function member(request: Request): Promise<Member> {
  const token = cookieValue(request);
  if (!token) throw new ApiError('กรุณาเข้าสู่ระบบ', 401);
  await checkDatabase();
  const session = await prisma.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: publicUserFields } } });
  if (!session || session.expiresAt <= new Date()) throw new ApiError('กรุณาเข้าสู่ระบบอีกครั้ง', 401);
  if (!session.user.active) throw new ApiError('บัญชีนี้ถูกระงับสิทธิ์ กรุณาติดต่อ Admin', 401);
  return session.user as Member;
}
export async function freshMember(tx: Transaction, member: Member): Promise<Member> {
  const user = await tx.user.findUnique({ where: { id: member.id }, select: publicUserFields });
  if (!user?.active) throw new ApiError('บัญชีนี้ถูกระงับสิทธิ์', 401);
  return user as Member;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Non-browser API clients may omit Origin. Cross-site browser requests may not.
  if (!origin) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError('ต้นทางคำขอไม่ถูกต้อง', 403);
    return;
  }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    const originHost = new URL(origin).host;
    if (host && originHost.toLowerCase() === host.toLowerCase()) return;
    // Allow vercel preview URLs belonging to this project
    if (originHost.endsWith('.vercel.app') && host && host.endsWith('.vercel.app')) return;
  } catch { /* Ignore invalid origin */ }

  const allowed = new Set([settings.frontendOrigin]);
  for (const h of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL]) {
    if (!h) continue;
    try { allowed.add(new URL(`https://${h}`).origin); } catch { /* Ignore invalid deployment configuration. */ }
  }
  if (!allowed.has(origin)) throw new ApiError('ต้นทางคำขอไม่ถูกต้อง', 403);
}

async function takeLoginAttempt(key: string, limit: number, windowMs: number) {
  const now = new Date(), expired = new Date(now.getTime() - windowMs);
  // One atomic statement shares the limit across processes and concurrent requests.
  const [attempt] = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "login_attempts" ("key", "attempts", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "login_attempts"."windowStart" <= ${expired} THEN 1 ELSE LEAST("login_attempts"."attempts" + 1, ${limit + 1}) END,
      "windowStart" = CASE WHEN "login_attempts"."windowStart" <= ${expired} THEN ${now} ELSE "login_attempts"."windowStart" END
    RETURNING "attempts"
  `;
  if (!attempt || attempt.attempts > limit) throw new ApiError('เข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 429);
}

// ลบเซสชันที่หมดอายุแล้ว (เซสชันที่ยังไม่หมดอายุไม่ถูกแตะ) คืนจำนวนที่ลบ
export async function purgeExpiredSessions(
  client: { session: { deleteMany(args: { where: { expiresAt: { lte: Date } } }): Promise<{ count: number }> } },
  now = new Date()
): Promise<number> {
  return (await client.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
}

export async function login(request: Request) {
  checkOrigin(request);
  let raw: unknown;
  try {
    raw = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid body');
  } catch { throw new ApiError('รูปแบบคำขอไม่ถูกต้อง'); }
  const parseResult = loginSchema.safeParse(raw);
  if (!parseResult.success) throw new ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
  const { email, password } = parseResult.data;

  await checkDatabase();

  await takeLoginAttempt('global', 120, 60_000);
  const attemptKey = `email:${digest(email)}`;
  await takeLoginAttempt(attemptKey, 10, 15 * 60_000);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash || await dummyHash);
  if (!user?.active || !valid) throw new ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
  const token = randomBytes(32).toString('hex');
  await prisma.$transaction(async tx => {
    // Prevent a concurrent password reset/deactivation from issuing a fresh session.
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current?.active || current.passwordHash !== user.passwordHash) throw new ApiError('กรุณาเข้าสู่ระบบอีกครั้ง', 401);
    await tx.session.create({ data: { tokenHash: digest(token), userId: user.id, expiresAt: new Date(Date.now() + duration * 1000) } });
    await tx.loginAttempt.deleteMany({ where: { key: attemptKey } });
  }, { isolationLevel: 'Serializable' });
  // ล้างเซสชันหมดอายุนอก transaction เพื่อไม่ให้ชนกันตอนมีคนล็อกอินพร้อมกัน ล้มเหลวได้โดยไม่กระทบการล็อกอิน
  try { await purgeExpiredSessions(prisma); } catch (error) { console.error('Expired session cleanup failed', { code: (error as { code?: string }).code }); }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } });
}
export async function logout(request: Request) {
  checkOrigin(request);
  const token = cookieValue(request);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: digest(token) } });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' } });
}
