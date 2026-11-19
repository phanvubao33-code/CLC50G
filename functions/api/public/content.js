import { error, json } from "../../_lib/cms.js";

function mediaUrl(key) {
  return key ? `/media/${key.split("/").map(encodeURIComponent).join("/")}` : null;
}

export async function onRequestGet({ env }) {
  if (!env.DB) return error("Nội dung CMS chưa được cấu hình.", 503);
  const [slotsResult, itemsResult, settingsResult] = await Promise.all([
    env.DB.prepare(`SELECT slot_id, section, aspect_ratio, caption, event_date, display_order, object_key, focal_x, focal_y
      FROM image_slots ORDER BY section, display_order, slot_id`).all(),
    env.DB.prepare(`SELECT item_id, kind, slot_id, title, body, event_date, nickname, display_order
      FROM content_items ORDER BY kind, display_order, item_id`).all(),
    env.DB.prepare("SELECT setting_key, setting_value FROM site_settings").all(),
  ]);
  const slots = (slotsResult.results || []).map(({ object_key, ...slot }) => ({ ...slot, image_url: mediaUrl(object_key) }));
  const settings = Object.fromEntries((settingsResult.results || []).map((row) => [row.setting_key, row.setting_value]));
  return json({ slots, items: itemsResult.results || [], settings });
}
