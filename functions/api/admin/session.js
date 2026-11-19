import { canRegisterAdmin, error, json, requireAdmin } from "../../_lib/cms.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error("CMS chưa được cấu hình.", 503);
  const admin = await requireAdmin(request, env);
  const registrationAvailable = await canRegisterAdmin(env);
  if (!admin) return json({ authenticated: false, registration_available: registrationAvailable }, 200);
  return json({ authenticated: true, email: admin.email, username: admin.email, role: admin.role, registration_available: false });
}
