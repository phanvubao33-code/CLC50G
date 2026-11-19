import { error, json, readJson, requireMutation } from "../../../../_lib/cms.js";
import { localUploadSignature, presignR2Put } from "../../../../_lib/r2-presign.js";

const MAX_BYTES = 12 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function onRequestPost({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  if (!env.DB || !env.IMAGES) return error("R2 hoặc D1 chưa được kết nối.", 503);
  const parsed = await readJson(request, 4096);
  if (parsed.error) return error(parsed.error);
  const { content_type: contentType, size } = parsed.value;
  if (!types.has(contentType)) return error("Chọn ảnh JPEG, PNG hoặc WebP.", 415);
  if (!Number.isInteger(size) || size < 1) return error("Kích thước ảnh không hợp lệ.", 400);
  if (size > MAX_BYTES) return error("Ảnh phải nhỏ hơn 12 MB.", 413);
  const slotId = String(params.id || "");
  const slot = await env.DB.prepare("SELECT slot_id, section FROM image_slots WHERE slot_id = ?1").bind(slotId).first();
  if (!slot) return error("Không tìm thấy ô ảnh.", 404);
  const uploadId = crypto.randomUUID();
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
  const objectKey = `pending/${uploadId}.${extension}`;
  const expires = Math.floor(Date.now() / 1000) + 300;
  const expiresAt = new Date(expires * 1000).toISOString().replace("T", " ").replace("Z", "");
  let uploadUrl;
  try {
    if (env.CMS_R2_PRESIGN_MODE === "local") {
      if (!env.CMS_LOCAL_UPLOAD_SECRET || env.CMS_LOCAL_UPLOAD_SECRET.length < 32) throw new Error("Local signing secret is not configured.");
      const signature = await localUploadSignature(env.CMS_LOCAL_UPLOAD_SECRET, `${uploadId}\n${objectKey}\n${contentType}\n${size}\n${expires}`);
      uploadUrl = `${new URL(request.url).origin}/api/r2-upload?upload_id=${uploadId}&expires=${expires}&signature=${signature}`;
    } else {
      uploadUrl = await presignR2Put({
        accountId: env.CMS_R2_ACCOUNT_ID,
        accessKeyId: env.CMS_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CMS_R2_SECRET_ACCESS_KEY,
        bucket: env.CMS_R2_BUCKET || "our-memories-images",
        key: objectKey,
        contentType,
      });
    }
  } catch {
    return error("Chưa cấu hình thông tin ký URL tải ảnh R2.", 503);
  }
  await env.DB.prepare("DELETE FROM image_upload_intents WHERE expires_at <= CURRENT_TIMESTAMP").run();
  await env.DB.prepare(`INSERT INTO image_upload_intents (upload_id, admin_id, slot_id, object_key, content_type, max_bytes, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(uploadId, auth.admin.admin_id, slot.slot_id, objectKey, contentType, size, expiresAt).run();
  return json({ upload_id: uploadId, upload_url: uploadUrl, headers: { "Content-Type": contentType }, expires_in: 300 });
}
