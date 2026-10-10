import { checkOrigin, member } from '../auth/sessions';
import { ApiError, allow } from '../services/asset-service';
import { ASSET_IMAGE_MAX_BYTES, deleteAssetImage, getAssetImage, saveAssetImage } from '../services/asset-images';
import { fail } from './data';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function failure(error: unknown) {
  const response = fail(error);
  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  return response;
}

function detectImageContentType(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'image/webp';
}

export async function GET(request: Request) {
  try {
    await member(request);
    const image = await getAssetImage(new URL(request.url).searchParams.get('asset'));
    const rawBytes = image.body instanceof Uint8Array ? image.body : new Uint8Array(image.body as ArrayBuffer);
    const contentType = detectImageContentType(rawBytes);
    return new Response(image.body as unknown as BodyInit, { headers: { ...privateHeaders, 'Content-Type': contentType } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await member(request);
    allow(user, ['staff', 'admin']);
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) throw new ApiError('กรุณาส่งรูปภาพในรูปแบบ multipart/form-data');
    const maxBodyBytes = ASSET_IMAGE_MAX_BYTES + 256 * 1024;
    if (Number(request.headers.get('content-length')) > maxBodyBytes) throw new ApiError('รูปภาพต้องไม่เกิน 4 MB', 413);
    
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError('รูปแบบคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    }
    return Response.json(await saveAssetImage(user, form), { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await member(request);
    allow(user, ['staff', 'admin']);
    let data: unknown;
    try {
      data = await request.json();
    } catch {
      throw new ApiError('รูปแบบคำขอไม่ถูกต้อง');
    }
    return Response.json(await deleteAssetImage(user, data), { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
