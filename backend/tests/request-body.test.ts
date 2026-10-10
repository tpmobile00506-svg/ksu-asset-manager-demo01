import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedFormData, boundedJson, readBoundedBody } from '../services/request-body';

// เพดานทดสอบ 10 ไบต์ ตัวเลขทุกค่าคำนวณมือ: 4+4 = 8 (ผ่าน), 4+4+4 = 12 (เกิน), 10 พอดี (ผ่าน), 11 (เกิน)
const max = 10;
const msg = 'ใหญ่เกินกำหนด';
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;

function streamed(...sizes: number[]) {
  let i = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) { if (i < sizes.length) controller.enqueue(new Uint8Array(sizes[i++]).fill(65)); else controller.close(); } });
}
const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', headers, body, duplex: 'half' } as RequestInit);

test('คำขอที่ประกาศ Content-Length เกินเพดานถูกปฏิเสธ 413 โดยไม่ต้องอ่านเนื้อหา', async () => {
  const request = post(streamed(1), { 'content-length': '11' });
  await assert.rejects(readBoundedBody(request, max, msg), status(413));
});

test('คำขอสตรีมที่ไม่มี Content-Length แต่ขนาดจริงเกินเพดาน (4+4+4 = 12 ไบต์) ถูกปฏิเสธ 413', async () => {
  const request = post(streamed(4, 4, 4));
  assert.equal(request.headers.get('content-length'), null);
  await assert.rejects(readBoundedBody(request, max, msg), status(413));
});

test('ขนาดจริง 8 ไบต์ (4+4) และ 10 ไบต์พอดี ผ่าน แต่ 11 ไบต์ไม่ผ่าน', async () => {
  assert.equal((await readBoundedBody(post(streamed(4, 4)), max, msg)).byteLength, 8);
  assert.equal((await readBoundedBody(post(streamed(10)), max, msg)).byteLength, 10);
  await assert.rejects(readBoundedBody(post(streamed(10, 1)), max, msg), status(413));
});

test('คำขอที่ไม่มีเนื้อหาคืนค่าว่าง', async () => {
  assert.equal((await readBoundedBody(post(null), max, msg)).byteLength, 0);
});

test('boundedJson อ่าน JSON ที่ขนาดไม่เกินเพดาน และ JSON เสียโยน SyntaxError (เพื่อให้ตอบ 400)', async () => {
  // {"a":1} = 7 ไบต์
  assert.deepEqual(await boundedJson(post('{"a":1}'), max, msg), { a: 1 });
  await assert.rejects(boundedJson(post('{'), max, msg), SyntaxError);
  await assert.rejects(boundedJson(post('{"a":"toolong"}'), max, msg), status(413));
});

test('boundedFormData อ่าน multipart ได้ และ multipart ที่เสียตอบ 400 ไม่ใช่ 413', async () => {
  const form = new FormData();
  form.append('k', 'v');
  const built = new Request('http://localhost/x', { method: 'POST', body: form });
  const contentType = built.headers.get('content-type') || '';
  const bytes = new Uint8Array(await built.arrayBuffer());
  const parsed = await boundedFormData(post(bytes, { 'content-type': contentType }), 10_000, msg);
  assert.equal(parsed.get('k'), 'v');
  await assert.rejects(boundedFormData(post(streamed(4), { 'content-type': 'multipart/form-data; boundary=x' }), max, msg), status(400));
});
