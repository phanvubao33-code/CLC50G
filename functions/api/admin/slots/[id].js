import { error, json, readJson, requireMutation } from "../../../_lib/cms.js";

const slotIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  const slotId = String(params.id || "");
  if (!slotIdPattern.test(slotId)) return error("Mã ô ảnh không hợp lệ.");
  const parsed = await readJson(request);
  if (parsed.error) return error(parsed.error);
  const body = parsed.value;
  const current = await env.DB.prepare("SELECT caption, event_date FROM image_slots WHERE slot_id = ?1").bind(slotId).first();
  if (!current) return error("Không tìm thấy ô ảnh.", 404);
  const updates = [];
  const values = [];
  if (Object.hasOwn(body, "caption")) {
    if (typeof body.caption !== "string" || body.caption.length > 240) return error("Chú thích không hợp lệ.");
    updates.push("caption = ?"); values.push(body.caption.trim());
  }
  if (Object.hasOwn(body, "event_date")) {
    if (body.event_date !== null && (typeof body.event_date !== "string" || body.event_date.length > 100)) return error("Ngày tháng không hợp lệ.");
    updates.push("event_date = ?"); values.push(body.event_date?.trim() || null);
  }
  for (const axis of ["focal_x", "focal_y"]) {
    if (Object.hasOwn(body, axis)) {
      const value = Number(body[axis]);
      if (!Number.isInteger(value) || value < 0 || value > 100) return error("Vị trí ảnh phải nằm trong khoảng 0–100.");
      updates.push(`${axis} = ?`); values.push(value);
    }
  }
  if (!updates.length) return error("Không có nội dung nào cần cập nhật.");
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(slotId);
  const statements = [env.DB.prepare(`UPDATE image_slots SET ${updates.join(", ")} WHERE slot_id = ?`).bind(...values)];
  if (Object.hasOwn(body, "caption") || Object.hasOwn(body, "event_date")) {
    const caption = Object.hasOwn(body, "caption") ? body.caption.trim() : current.caption;
    const date = Object.hasOwn(body, "event_date") ? body.event_date?.trim() || null : current.event_date;
    statements.push(env.DB.prepare(`UPDATE content_items SET title = ?1, event_date = ?2, updated_at = CURRENT_TIMESTAMP WHERE slot_id = ?3`)
      .bind(caption, date, slotId));
  }
  await env.DB.batch(statements);
  return json({ success: true });
}
