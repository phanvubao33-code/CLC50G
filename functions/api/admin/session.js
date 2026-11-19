import { error, json, requireAdmin } from "../../_lib/cms.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB || !(env.CMS_ADMIN_USERNAME || env.CMS_ADMIN_EMAIL) || !env.CMS_ADMIN_PASSWORD) return error("CMS chưa được cấu hình.", 503);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ authenticated: false }, 200);
  const username = env.CMS_ADMIN_USERNAME || env.CMS_ADMIN_EMAIL;
  return json({ authenticated: true, email: username, username, role: admin.role });
}
