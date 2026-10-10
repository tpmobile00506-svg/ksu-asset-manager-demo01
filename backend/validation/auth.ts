import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', invalid_type_error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    .trim()
    .toLowerCase()
    .max(200, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'),
  password: z
    .string({ required_error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', invalid_type_error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    .min(1, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    .max(128, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'),
});

export type LoginInput = z.infer<typeof loginSchema>;
