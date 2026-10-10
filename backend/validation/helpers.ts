import { z } from 'zod';
import { ApiError } from '../services/errors';

export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown, status = 400): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    let message = firstIssue.message;
    if (firstIssue.code === 'invalid_union_discriminator') {
      message = 'ระบุประเภทและเหตุผลของคำขอ';
    }
    throw new ApiError(message, status);
  }
  return result.data;
}
