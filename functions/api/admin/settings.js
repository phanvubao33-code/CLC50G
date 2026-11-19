import { error, json, readJson, requireAdmin, requireMutation } from "../../_lib/cms.js";

const ALLOWED = new Set(["hero_lead", "hero_line", "hero_accent", "hero_intro", "closing_title", "closing_body"]);

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return error("Vui lòng đăng nhập với tài khoản quản trị.", 401);
  const result = await env.DB.prepare("SELECT setting_key, setting_value FROM site_settings").all();
  return json(Object.fromEntries((result.results || []).map((row) => [row.setting_key, row.setting_value])));
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireMutation(request, env);
  if (auth.response) return auth.response;
  const parsed = await readJson(request);
  if (parsed.error) return error(parsed.error);
  const entries = Object.entries(parsed.value);
  if (!entries.length || entries.some(([key, value]) => !ALLOWED.has(key) || typeof value !== "string" || value.length > 1200)) return error("Thông tin mở đầu hoặc kết thúc không hợp lệ.");
  await env.DB.batch(entries.map(([key, value]) => env.DB.prepare(`INSERT INTO site_settings (setting_key, setting_value, updated_at)
    VALUES (?1, ?2, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`).bind(key, value.trim())));
  return json({ success: true });
}
