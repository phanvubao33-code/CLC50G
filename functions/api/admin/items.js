import { error, json, readJson, requireAdmin, requireMutation } from "../../_lib/cms.js";

const KINDS = new Set(["memory", "timeline", "member", "message"]);
const SLOT_CONFIG = {
  memory: { section: "moments", ratio: "4:3" },
  timeline: { section: "journey", ratio: "4:3" },
  member: { section: "people", ratio: "3:4" },
};

function textField(value, max, allowEmpty = true) {
  if (typeof value !== "string" || value.length > max) return null;
  const trimmed = value.trim();
  return !allowEmpty && !trimmed ? null : trimmed;
}

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return error("Vui lòng đăng nhập với tài khoản quản trị.", 401);
  const result = await env.DB.prepare(`SELECT item_id, kind, slot_id, title, body, event_date, nickname, display_order
    FROM content_items ORDER BY kind, display_order, item_id`).all();
  return json({ items: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  const parsed = await readJson(request);
  if (parsed.error) return error(parsed.error);
  const body = parsed.value;
  if (!KINDS.has(body.kind)) return error("Loại nội dung không hợp lệ.");
  const title = textField(body.title, 160, false);
  const description = textField(body.body ?? "", 2000);
  const date = body.event_date == null ? null : textField(body.event_date, 100);
  const nickname = textField(body.nickname ?? "", 160);
  if (title === null || description === null || (body.event_date != null && date === null) || nickname === null) return error("Vui lòng kiểm tra lại nội dung.");

  const itemId = crypto.randomUUID();
  const slotConfig = SLOT_CONFIG[body.kind];
  const slotId = slotConfig ? `${body.kind}-${crypto.randomUUID().slice(0, 8)}` : null;
  const nextOrder = await env.DB.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM content_items WHERE kind = ?1")
    .bind(body.kind).first();
  const statements = [];
  if (slotConfig) statements.push(env.DB.prepare(`INSERT INTO image_slots (slot_id, section, aspect_ratio, caption, event_date, display_order)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(slotId, slotConfig.section, slotConfig.ratio, title, date, nextOrder.next_order));
  statements.push(env.DB.prepare(`INSERT INTO content_items (item_id, kind, slot_id, title, body, event_date, nickname, display_order)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(itemId, body.kind, slotId, title, description, date, nickname, nextOrder.next_order));
  await env.DB.batch(statements);
  return json({ success: true, item: { item_id: itemId, kind: body.kind, slot_id: slotId, title, body: description, event_date: date, nickname, display_order: nextOrder.next_order } }, 201);
}
