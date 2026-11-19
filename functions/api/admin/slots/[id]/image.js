import { error, json, requireMutation } from "../../../../_lib/cms.js";

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  if (!env.DB || !env.IMAGES) return error("R2 hoặc D1 chưa được kết nối.", 503);
  const slot = await env.DB.prepare("SELECT object_key FROM image_slots WHERE slot_id = ?1").bind(String(params.id || "")).first();
  if (!slot) return error("Không tìm thấy ô ảnh.", 404);
  await env.DB.batch([
    env.DB.prepare("UPDATE image_slots SET object_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE slot_id = ?1").bind(String(params.id || "")),
    env.DB.prepare("DELETE FROM image_upload_intents WHERE slot_id = ?1").bind(String(params.id || "")),
  ]);
  if (slot.object_key) await env.IMAGES.delete(slot.object_key);
  return json({ success: true });
}
