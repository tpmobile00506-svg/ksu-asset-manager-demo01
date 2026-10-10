import { z } from 'zod';
import { roles, standardBranches, normalizeBranch, type Role } from '../contracts/domain';

const roleKeys = Object.keys(roles) as [Role, ...Role[]];

export const userMutationSchema = z.object({
  action: z.literal('user'),
  token: z.string().max(100).optional(),
  name: z
    .string({ required_error: 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง' })
    .trim()
    .min(1, 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง')
    .max(200, 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง'),
  email: z
    .string({ required_error: 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง' })
    .trim()
    .toLowerCase()
    .max(200, 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง'),
  role: z.enum(roleKeys, { errorMap: () => ({ message: 'ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง' }) }),
  branch: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .refine(val => {
      if (!val) return true;
      const normalized = normalizeBranch(val, '', '');
      return standardBranches.includes(normalized as any);
    }, { message: 'สาขาไม่ถูกต้อง กรุณาเลือกสาขาจากรายการมาตรฐาน' })
    .transform(val => {
      if (val === undefined) return undefined;
      if (!val) return null;
      return normalizeBranch(val, '', '');
    }),
  active: z
    .union([z.boolean(), z.number().int().min(0).max(1)])
    .optional()
    .transform(val => (val === false || val === 0 ? 0 : 1)),
  password: z
    .string()
    .min(12, 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร')
    .max(128, 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร')
    .optional(),
});

export type UserMutationInput = z.infer<typeof userMutationSchema>;
