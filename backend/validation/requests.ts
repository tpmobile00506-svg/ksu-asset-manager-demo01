import { z } from 'zod';
import { MAX_BATCH_ITEMS as MAX_BATCH } from '../contracts/domain';

export const transferPayloadSchema = z.object({
  location: z
    .string({ required_error: 'ระบุสถานที่และสาขาปลายทาง', invalid_type_error: 'ระบุสถานที่และสาขาปลายทาง' })
    .trim()
    .min(1, 'ระบุสถานที่และสาขาปลายทาง'),
  branch: z
    .string({ required_error: 'ระบุสถานที่และสาขาปลายทาง', invalid_type_error: 'ระบุสถานที่และสาขาปลายทาง' })
    .trim()
    .min(1, 'ระบุสถานที่และสาขาปลายทาง'),
  // ผู้รับผิดชอบใหม่ (ไม่บังคับ): ถ้าไม่ระบุ ผู้รับผิดชอบเดิมไม่เปลี่ยน
  custodian: z.string().trim().max(200, 'ชื่อผู้รับผิดชอบยาวเกินกำหนด').optional(),
});

export const repairPayloadSchema = z.object({
  estimateSatang: z
    .number({ required_error: 'ประมาณการค่าซ่อมไม่ถูกต้อง', invalid_type_error: 'ประมาณการค่าซ่อมไม่ถูกต้อง' })
    .int('ประมาณการค่าซ่อมไม่ถูกต้อง')
    .min(0, 'ประมาณการค่าซ่อมไม่ถูกต้อง')
    .max(100_000_000_000_000, 'ประมาณการค่าซ่อมไม่ถูกต้อง')
    .default(0),
});

export const disposalPayloadSchema = z.unknown().optional();

const baseRequestFields = {
  action: z.literal('request'),
  token: z.string().max(100).optional(),
  id: z
    .string({ required_error: 'กรุณาระบุรหัสครุภัณฑ์', invalid_type_error: 'กรุณาระบุรหัสครุภัณฑ์' })
    .trim()
    .min(1, 'กรุณาระบุรหัสครุภัณฑ์'),
  version: z
    .number({ required_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', invalid_type_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่' })
    .int('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่'),
  reason: z
    .string({ required_error: 'ระบุประเภทและเหตุผลของคำขอ', invalid_type_error: 'ระบุประเภทและเหตุผลของคำขอ' })
    .trim()
    .min(1, 'ระบุประเภทและเหตุผลของคำขอ'),
  splitQuantity: z
    .number({ invalid_type_error: 'จำนวนที่แบ่งต้องเป็นจำนวนเต็ม' })
    .int('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม')
    .min(1, 'จำนวนที่แบ่งต้องเป็นจำนวนเต็ม')
    .optional()
    .nullable(),
};

export const transferRequestSchema = z.object({
  ...baseRequestFields,
  kind: z.literal('transfer'),
  // ไม่ส่งข้อมูลปลายทางมาเลย: ตอบเป็นภาษาไทยแทน "Required" ของ zod
  payload: transferPayloadSchema
    .optional()
    .refine(v => v !== undefined, 'ระบุสถานที่และสาขาปลายทาง')
    .transform(v => v!),
});

export const repairRequestSchema = z.object({
  ...baseRequestFields,
  kind: z.literal('repair'),
  payload: repairPayloadSchema.nullish().transform(v => v ?? { estimateSatang: 0 }),
});

export const disposalRequestSchema = z.object({
  ...baseRequestFields,
  kind: z.literal('disposal'),
  payload: disposalPayloadSchema,
});

export const assetRequestSchema = z.discriminatedUnion('kind', [
  transferRequestSchema,
  repairRequestSchema,
  disposalRequestSchema,
]);

export type AssetRequestInput = z.infer<typeof assetRequestSchema>;

export const approvalMutationSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    token: z.string().max(100).optional(),
    id: z
      .string({ required_error: 'กรุณาระบุรหัสคำขอ', invalid_type_error: 'กรุณาระบุรหัสคำขอ' })
      .trim()
      .min(1, 'กรุณาระบุรหัสคำขอ'),
    version: z
      .number({ required_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', invalid_type_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่' })
      .int('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่'),
    reason: z.string().optional().nullable(),
  })
  .refine(
    data => {
      if (data.action === 'reject') {
        return Boolean(data.reason && data.reason.trim().length > 0);
      }
      return true;
    },
    { message: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ', path: ['reason'] },
  );

export type ApprovalMutationInput = z.infer<typeof approvalMutationSchema>;

// ทำหลายรายการในครั้งเดียว (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569): ยื่นคำขอ / อนุมัติที่เลือก ครั้งละไม่เกิน MAX_BATCH_ITEMS รายการ
const batchItems = (what: string) =>
  z
    .array(
      z.object({
        id: z
          .string({ invalid_type_error: `รหัส${what}ไม่ถูกต้อง` })
          .trim()
          .min(1, `รหัส${what}ไม่ถูกต้อง`),
        version: z
          .number({
            required_error: 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่',
            invalid_type_error: 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่',
          })
          .int('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่'),
      }),
      { required_error: `เลือก${what}อย่างน้อย 1 รายการ`, invalid_type_error: `เลือก${what}อย่างน้อย 1 รายการ` },
    )
    .min(1, `เลือก${what}อย่างน้อย 1 รายการ`)
    .max(MAX_BATCH, `เลือก${what}ได้ครั้งละไม่เกิน ${MAX_BATCH} รายการ`)
    .refine(list => new Set(list.map(x => x.id)).size === list.length, `เลือก${what}ซ้ำกัน กรุณาโหลดใหม่`);

// ประเภท เหตุผล และปลายทาง ใช้ร่วมกันทุกรายการ ตรวจละเอียดด้วย assetRequestSchema ตัวเดียวกับยื่นทีละรายการ
export const requestManySchema = z.object({
  action: z.literal('requestMany'),
  token: z.string().max(100).optional(),
  items: batchItems('ครุภัณฑ์'),
  kind: z.unknown(),
  reason: z.unknown(),
  payload: z.unknown(),
});

export const approveManySchema = z.object({
  action: z.literal('approveMany'),
  token: z.string().max(100).optional(),
  items: batchItems('คำขอ'),
  reason: z.string().max(500, 'ความเห็นยาวเกินกำหนด').optional().nullable(),
});

// ผู้ยื่นยกเลิกคำขอของตัวเองได้ระหว่างรออนุมัติทุกขั้น (ผู้ใช้เลือก 7 พ.ย. 2569) เหตุผลไม่บังคับ
export const cancelRequestSchema = z.object({
  action: z.literal('cancelRequest'),
  token: z.string().max(100).optional(),
  id: z
    .string({ required_error: 'กรุณาระบุรหัสคำขอ', invalid_type_error: 'กรุณาระบุรหัสคำขอ' })
    .trim()
    .min(1, 'กรุณาระบุรหัสคำขอ'),
  version: z
    .number({ required_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', invalid_type_error: 'คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่' })
    .int('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่'),
  reason: z.string().max(500, 'เหตุผลยาวเกินกำหนด').optional().nullable(),
});

export const workflowMutationSchema = z.object({
  action: z.literal('workflow'),
  token: z.string().max(100).optional(),
  chain: z
    .array(z.enum(['head', 'deputy', 'dean'], { errorMap: () => ({ message: 'สายอนุมัติไม่ถูกต้อง' }) }))
    .min(1, 'สายอนุมัติไม่ถูกต้อง')
    .max(3, 'สายอนุมัติไม่ถูกต้อง')
    .refine(arr => new Set(arr).size === arr.length, 'สายอนุมัติไม่ถูกต้อง'),
});

export type WorkflowMutationInput = z.infer<typeof workflowMutationSchema>;
