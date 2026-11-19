import { error, json } from "../_lib/cms.js";
import { localUploadSignature } from "../_lib/r2-presign.js";

const MAX_BYTES = 12 * 1024 * 1024;
const validImage = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/webp": (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

async function readBounded(stream, max) {
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPut({ request, env }) {
  if (env.CMS_R2_PRESIGN_MODE !== "local" || !env.CMS_LOCAL_UPLOAD_SECRET || !env.DB || !env.IMAGES) return error("Không tìm thấy đường tải ảnh.", 404);
  const url = new URL(request.url), uploadId = url.searchParams.get("upload_id") || "", expires = Number(url.searchParams.get("expires")), signature = url.searchParams.get("signature") || "";
  if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !Number.isInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 301) return error("Liên kết tải ảnh đã hết hạn.", 403);
  const intent = await env.DB.prepare(`SELECT object_key, content_type, max_bytes FROM image_upload_intents
    WHERE upload_id = ?1 AND expires_at > CURRENT_TIMESTAMP`).bind(uploadId).first();
  if (!intent) return error("Liên kết tải ảnh đã hết hạn.", 403);
  const expected = await localUploadSignature(env.CMS_LOCAL_UPLOAD_SECRET, `${uploadId}\n${intent.object_key}\n${intent.content_type}\n${intent.max_bytes}\n${expires}`);
  if (!equal(signature, expected)) return error("Liên kết tải ảnh không hợp lệ.", 403);
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== intent.content_type) return error("Định dạng tải lên không khớp.", 415);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > intent.max_bytes || length > MAX_BYTES) return error("Ảnh vượt quá giới hạn.", 413);
  const bytes = await readBounded(request.body, Math.min(intent.max_bytes, MAX_BYTES));
  if (!bytes || !bytes.length || !validImage[type](bytes)) return error("Nội dung tệp không khớp với định dạng ảnh.", 415);
  await env.IMAGES.put(intent.object_key, bytes, { httpMetadata: { contentType: type }, customMetadata: { uploadId } });
  return json({ success: true });
}
