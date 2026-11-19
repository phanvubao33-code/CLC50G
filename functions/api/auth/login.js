import { constantTimeEqual, createSession, createUserSession, error, hashPassword, json, rateLimited, readJson, sameOrigin, sessionCookie, sha256, userSessionCookie, verifyPassword } from "../../_lib/cms.js";

async function clearRateLimit(db, request) {
  const key = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await db.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(key).run();
}

async function adminLogin(env, username, password) {
  const configuredUsername = (env.CMS_ADMIN_USERNAME || env.CMS_ADMIN_EMAIL || "vubao07").trim().toLowerCase();
  if (!configuredUsername || username !== configuredUsername || !env.CMS_ADMIN_PASSWORD || env.CMS_ADMIN_PASSWORD.length < 16) return null;
  const supplied = await sha256(`${username}\0${password}`);
  const expected = await sha256(`${configuredUsername}\0${env.CMS_ADMIN_PASSWORD}`);
  if (!constantTimeEqual(supplied, expected)) return null;

  const existing = await env.DB.prepare("SELECT user_id, role FROM users WHERE username = ?1 COLLATE NOCASE").bind(username).first();
  if (existing?.role === "member") return { response: error("Tên tài khoản này đã được sử dụng.", 409) };
  const userId = existing?.user_id || crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const adminId = await sha256(username);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (user_id, username, password_hash, role, last_login_at)
        VALUES (?1, ?2, ?3, 'admin', CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', is_active = 1, last_login_at = CURRENT_TIMESTAMP`)
        .bind(userId, username, passwordHash),
      env.DB.prepare(`INSERT INTO admins (admin_id, email, role, is_active, last_login_at)
        VALUES (?1, ?2, 'admin', 1, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET is_active = 1, last_login_at = CURRENT_TIMESTAMP`).bind(adminId, username),
    ]);
  } catch {
    return { response: error("Không thể tạo phiên quản trị. Hãy chạy D1 migrations mới nhất.", 503) };
  }
  const userToken = await createUserSession(env.DB, userId);
  const adminToken = await createSession(env.DB, adminId);
  const response = json({ authenticated: true, username, role: "admin" });
  response.headers.append("Set-Cookie", userSessionCookie(userToken));
  response.headers.append("Set-Cookie", sessionCookie(adminToken));
  return { response };
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

  const adminUsername = "vubao07";
  if (username === adminUsername) {
    if (!env.CMS_ADMIN_PASSWORD || env.CMS_ADMIN_PASSWORD.length < 16) return error("Tài khoản quản trị chưa được cấu hình trên Cloudflare.", 503);
    const admin = await adminLogin(env, username, password);
    if (admin?.response) {
      if (admin.response.status === 200) await clearRateLimit(env.DB, request);
      return admin.response;
    }
    return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
  }

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
