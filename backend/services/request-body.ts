import { ApiError } from './errors';

// อ่านเนื้อหาคำขอพร้อมนับขนาดจริง หยุดและตอบ 413 ทันทีเมื่อเกินเพดาน
// ไม่เชื่อหัว Content-Length อย่างเดียว เพราะคำขอแบบสตรีม (chunked) ไม่มีหัวนี้ และ request.formData()/json() จะอ่านทั้งก้อนเข้าหน่วยความจำก่อน
export async function readBoundedBody(request: Request, maxBytes: number, message: string): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(message, 413);
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError(message, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function boundedFormData(request: Request, maxBytes: number, message: string): Promise<FormData> {
  const bytes = await readBoundedBody(request, maxBytes, message);
  try {
    return await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
  } catch {
    throw new ApiError('รูปแบบคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
  }
}

export async function boundedJson(request: Request, maxBytes: number, message: string): Promise<unknown> {
  // JSON ที่ผิดรูปแบบโยน SyntaxError ตามเดิม เพื่อให้ fail() ตอบ 400
  return JSON.parse(new TextDecoder().decode(await readBoundedBody(request, maxBytes, message)));
}
