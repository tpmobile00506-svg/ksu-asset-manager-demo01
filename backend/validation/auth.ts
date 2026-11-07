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

// เปลี่ยนรหัสผ่านของตัวเอง: ต้องใส่รหัสเดิม รหัสใหม่ยาว 12–128 ตัวอักษร (เกณฑ์เดียวกับที่ Admin ตั้งให้)
export const passwordChangeSchema = z
  .object({
    action: z.literal('password'),
    token: z.string().max(100).optional(),
    currentPassword: z
      .string({ required_error: 'กรุณากรอกรหัสผ่านเดิม', invalid_type_error: 'กรุณากรอกรหัสผ่านเดิม' })
      .min(1, 'กรุณากรอกรหัสผ่านเดิม')
      .max(128, 'รหัสผ่านเดิมไม่ถูกต้อง'),
    password: z
      .string({ required_error: 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร' })
      .min(12, 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร')
      .max(128, 'รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร'),
  })
  .refine(d => d.currentPassword !== d.password, {
    message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม',
    path: ['password'],
  });
