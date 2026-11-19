import { error, json, readJson, requireMutation } from "../../../_lib/cms.js";

function readText(value, max, allowEmpty = true) {
  if (typeof value !== "string" || value.length > max) return null;
  const text = value.trim();
  return !allowEmpty && !text ? null : text;
}

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  const parsed = await readJson(request);
  if (parsed.error) return error(parsed.error);
  const body = parsed.value;
  const item = await env.DB.prepare("SELECT item_id, kind, slot_id FROM content_items WHERE item_id = ?1").bind(String(params.id || "")).first();
  if (!item) return error("Không tìm thấy nội dung.", 404);
  const allowed = { title: [160, false], body: [2000, true], event_date: [100, true], nickname: [160, true] };
  const updates = [];
  const values = [];
  for (const [field, [max, allowEmpty]] of Object.entries(allowed)) {
    if (!Object.hasOwn(body, field)) continue;
    if (field === "event_date" && body[field] === null) {
      updates.push("event_date = ?"); values.push(null); continue;
    }
    const value = readText(body[field], max, allowEmpty);
    if (value === null) return error("Vui lòng kiểm tra lại nội dung.");
    updates.push(`${field} = ?`); values.push(value);
  }
  if (!updates.length) return error("Không có nội dung nào cần cập nhật.");
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(item.item_id);
  await env.DB.prepare(`UPDATE content_items SET ${updates.join(", ")} WHERE item_id = ?`).bind(...values).run();
  if (item.slot_id) {
    const current = await env.DB.prepare("SELECT title, event_date FROM content_items WHERE item_id = ?1").bind(item.item_id).first();
    await env.DB.prepare(`UPDATE image_slots SET caption = ?1, event_date = ?2, updated_at = CURRENT_TIMESTAMP WHERE slot_id = ?3`)
      .bind(current.title, current.event_date, item.slot_id).run();
  }
  return json({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  if (!env.DB || !env.IMAGES) return error("R2 hoặc D1 chưa được kết nối.", 503);
  const item = await env.DB.prepare(`SELECT c.item_id, c.slot_id, s.object_key FROM content_items c
    LEFT JOIN image_slots s ON s.slot_id = c.slot_id WHERE c.item_id = ?1`).bind(String(params.id || "")).first();
  if (!item) return error("Không tìm thấy nội dung.", 404);
  const statements = [env.DB.prepare("DELETE FROM content_items WHERE item_id = ?1").bind(item.item_id)];
  if (item.slot_id) statements.push(env.DB.prepare("DELETE FROM image_slots WHERE slot_id = ?1").bind(item.slot_id));
  await env.DB.batch(statements);
  if (item.object_key) await env.IMAGES.delete(item.object_key);
  return json({ success: true });
}
