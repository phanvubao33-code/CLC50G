import { createUserSession, error, json, rateLimited, readJson, sameOrigin, userSessionCookie, verifyPassword } from "../../_lib/cms.js";

async function clearRateLimit(db, request) {
  const key = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await db.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(key).run();
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (!env.DB) return error("Tài khoản chưa được cấu hình.", 503);
  if (await rateLimited(env.DB, request)) return error("Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút.", 429);
  const parsed = await readJson(request, 4096);
  if (parsed.error) return error("Thông tin đăng nhập không hợp lệ.");
  const { username: rawUsername, password } = parsed.value;
  if (typeof rawUsername !== "string" || typeof password !== "string" || rawUsername.length > 32 || password.length > 128) return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);

  let user;
  try {
    user = await env.DB.prepare("SELECT user_id, username, password_hash, role FROM users WHERE username = ?1 COLLATE NOCASE AND is_active = 1")
      .bind(username).first();
  } catch {
    return error("Cơ sở dữ liệu chưa sẵn sàng. Hãy áp dụng D1 migrations mới nhất.", 503);
  }
  if (!user || user.role !== "member" || !(await verifyPassword(password, user.password_hash))) return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);

  await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?1").bind(user.user_id).run();
  const token = await createUserSession(env.DB, user.user_id);
  await clearRateLimit(env.DB, request);
  return json({ authenticated: true, username: user.username, role: "member" }, 200, { "Set-Cookie": userSessionCookie(token) });
}
