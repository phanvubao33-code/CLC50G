import { error, json, requireAdmin, requireUser } from "../../_lib/cms.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error("Tài khoản chưa được cấu hình.", 503);
  try {
    const user = await requireUser(request, env);
    if (user) return json({ authenticated: true, username: user.username, role: user.role });
    const admin = await requireAdmin(request, env);
    if (admin) return json({ authenticated: true, username: admin.email, role: "admin" });
    return json({ authenticated: false });
  } catch {
    return error("Cơ sở dữ liệu chưa sẵn sàng. Hãy áp dụng D1 migrations mới nhất.", 503);
  }
}
