import { error, json, readJson, requireMutation } from "../../_lib/cms.js";

export async function onRequestPatch({ request, env }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  const parsed = await readJson(request);
  if (parsed.error) return error(parsed.error);
  const { kind, ids } = parsed.value;
  if (!new Set(["memory", "timeline", "member", "message"]).has(kind) || !Array.isArray(ids) || ids.length > 100 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || id.length > 64)) {
    return error("Thứ tự nội dung không hợp lệ.");
  }
  const existing = await env.DB.prepare("SELECT item_id FROM content_items WHERE kind = ?1").bind(kind).all();
  const existingIds = new Set((existing.results || []).map((row) => row.item_id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) return error("Danh sách chưa đầy đủ hoặc đã thay đổi.", 409);
  if (ids.length) await env.DB.batch(ids.map((id, index) => env.DB.prepare("UPDATE content_items SET display_order = ?1, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?2").bind(index + 1, id)));
  const slots = await env.DB.prepare("SELECT item_id, slot_id FROM content_items WHERE kind = ?1 AND slot_id IS NOT NULL").bind(kind).all();
  if (slots.results?.length) await env.DB.batch(slots.results.map((slot) => {
    const itemIndex = ids.indexOf(slot.item_id);
    return env.DB.prepare("UPDATE image_slots SET display_order = ?1 WHERE slot_id = ?2").bind(itemIndex + 1, slot.slot_id);
  }));
  return json({ success: true });
}
