import { constantTimeEqual, createSession, error, hashPassword, json, rateLimited, readJson, sameOrigin, sessionCookie, sha256, verifyPassword } from "../../_lib/cms.js";

async function clearRateLimit(db, request) {
  const key = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await db.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(key).run();
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (!env.DB) return error("CMS chưa được cấu hình đầy đủ.", 503);
  if (await rateLimited(env.DB, request)) return error("Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút.", 429);

  const parsed = await readJson(request, 4096);
  if (parsed.error) return error("Thông tin đăng nhập không hợp lệ.");
  const body = parsed.value;
  const rawUsername = body.username ?? body.email;
  if (typeof rawUsername !== "string" || typeof body.password !== "string" || rawUsername.length > 254 || body.password.length > 256) {
    return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
  }

  const username = rawUsername.trim().toLowerCase();
  let account;
  try {
    account = await env.DB.prepare(`SELECT admin_id, email, username, password_hash FROM admins
      WHERE is_active = 1 AND (username = ?1 OR email = ?1) LIMIT 1`).bind(username).first();
  } catch {
    return error("Cơ sở dữ liệu chưa được cập nhật. Hãy áp dụng các D1 migrations mới nhất.", 503);
  }
  let valid = account?.password_hash ? await verifyPassword(body.password, account.password_hash) : false;

  // Migrate the previous single-admin secret configuration on its first successful login.
  const configuredUsername = (env.CMS_ADMIN_USERNAME || env.CMS_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!valid && (!account || !account.password_hash) && configuredUsername && env.CMS_ADMIN_PASSWORD && constantTimeEqual(
    await sha256(`${username}\0${body.password}`),
    await sha256(`${configuredUsername}\0${env.CMS_ADMIN_PASSWORD}`),
  )) {
    const passwordHash = await hashPassword(body.password);
    const adminId = account?.admin_id || await sha256(configuredUsername);
    await env.DB.prepare(`INSERT INTO admins (admin_id, email, username, password_hash, role, is_active, last_login_at)
      VALUES (?1, ?2, ?2, ?3, 'admin', 1, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, is_active = 1, last_login_at = CURRENT_TIMESTAMP`)
      .bind(adminId, configuredUsername, passwordHash).run();
    valid = true;
  }
  if (!valid || !account && username !== configuredUsername) return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);

  const adminId = account?.admin_id || await sha256(username);
  await env.DB.prepare("UPDATE admins SET last_login_at = CURRENT_TIMESTAMP WHERE admin_id = ?1").bind(adminId).run();
  const token = await createSession(env.DB, adminId);
  await clearRateLimit(env.DB, request);
  return json({ authenticated: true, username: account?.username || account?.email || username, role: "admin" }, 200, { "Set-Cookie": sessionCookie(token) });
}
