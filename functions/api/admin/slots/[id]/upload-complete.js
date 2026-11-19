import { error, json, readJson, requireMutation } from "../../../../_lib/cms.js";

const formats = {
  "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  "image/webp": (bytes) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

async function readHead(object, limit = 12) {
  const reader = object.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, limit - size);
      parts.push(part); size += part.length;
      if (part.length < value.length) { await reader.cancel(); break; }
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export async function onRequestPost({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  if (!env.DB || !env.IMAGES) return error("R2 hoặc D1 chưa được kết nối.", 503);
  const parsed = await readJson(request, 4096);
  if (parsed.error) return error(parsed.error);
  const uploadId = typeof parsed.value.upload_id === "string" ? parsed.value.upload_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return error("Phiên tải ảnh không hợp lệ.");
  const intent = await env.DB.prepare(`SELECT upload_id, slot_id, object_key, content_type, max_bytes
    FROM image_upload_intents WHERE upload_id = ?1 AND admin_id = ?2 AND slot_id = ?3 AND expires_at > CURRENT_TIMESTAMP`)
    .bind(uploadId, auth.admin.admin_id, String(params.id || "")).first();
  if (!intent) return error("Phiên tải ảnh đã hết hạn hoặc không hợp lệ.", 410);
  const pending = await env.IMAGES.head(intent.object_key);
  if (!pending || pending.size !== intent.max_bytes || pending.httpMetadata?.contentType !== intent.content_type) return error("Ảnh tải lên chưa hoàn tất hoặc không hợp lệ.", 422);
  const sample = await env.IMAGES.get(intent.object_key, { range: { offset: 0, length: 12 } });
  if (!sample || !formats[intent.content_type](await readHead(sample))) return error("Nội dung tệp không khớp với định dạng ảnh.", 415);

  const old = await env.DB.prepare("SELECT object_key, section FROM image_slots WHERE slot_id = ?1").bind(intent.slot_id).first();
  if (!old) return error("Không tìm thấy ô ảnh.", 404);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[intent.content_type];
  const finalKey = `class-memory/${old.section}/${intent.slot_id}-${crypto.randomUUID()}.${extension}`;
  const uploaded = await env.IMAGES.get(intent.object_key);
  if (!uploaded) return error("Không tìm thấy tệp ảnh tải lên.", 422);
  await env.IMAGES.put(finalKey, uploaded.body, {
    httpMetadata: { contentType: intent.content_type, cacheControl: "public, max-age=86400, immutable" },
    customMetadata: { slotId: intent.slot_id },
  });
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE image_slots SET object_key = ?1, updated_at = CURRENT_TIMESTAMP WHERE slot_id = ?2").bind(finalKey, intent.slot_id),
      env.DB.prepare("DELETE FROM image_upload_intents WHERE upload_id = ?1").bind(uploadId),
    ]);
  } catch (cause) {
    await env.IMAGES.delete(finalKey);
    throw cause;
  }
  await env.IMAGES.delete(intent.object_key);
  if (old.object_key) await env.IMAGES.delete(old.object_key);
  return json({ success: true, image_url: `/media/${finalKey.split("/").map(encodeURIComponent).join("/")}` });
}
