import { createSession, error, json, rateLimited, readJson, sameOrigin, sessionCookie, sha256 } from "../../_lib/cms.js";

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

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
  const { username: rawUsername, password } = parsed.value;
  if (typeof rawUsername !== "string" || typeof password !== "string" || rawUsername.length > 128 || password.length > 256) {
    return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
  }

  const configuredUsername = (env.CMS_ADMIN_USERNAME || env.CMS_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!configuredUsername || !env.CMS_ADMIN_PASSWORD || env.CMS_ADMIN_PASSWORD.length < 16) {
    return error("Hãy cấu hình CMS_ADMIN_USERNAME và mật khẩu admin dài ít nhất 16 ký tự trong Cloudflare.", 503);
  }
  const username = rawUsername.trim().toLowerCase();
  const expected = await sha256(`${configuredUsername}\0${env.CMS_ADMIN_PASSWORD}`);
  const supplied = await sha256(`${username}\0${password}`);
  if (!constantTimeEqual(supplied, expected)) return error("Tên đăng nhập hoặc mật khẩu không đúng.", 401);

  const adminId = await sha256(configuredUsername);
  await env.DB.prepare(`INSERT INTO admins (admin_id, email, role, is_active, last_login_at)
    VALUES (?1, ?2, 'admin', 1, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET is_active = 1, last_login_at = CURRENT_TIMESTAMP`)
    .bind(adminId, configuredUsername).run();
  const admin = await env.DB.prepare("SELECT admin_id FROM admins WHERE email = ?1 AND is_active = 1")
    .bind(configuredUsername).first();
  if (!admin) return error("Không thể khởi tạo phiên quản trị.", 503);
  const token = await createSession(env.DB, admin.admin_id);
  await clearRateLimit(env.DB, request);
  return json({ authenticated: true, username: configuredUsername, role: "admin" }, 200, { "Set-Cookie": sessionCookie(token) });
}
