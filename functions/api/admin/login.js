import { createSession, error, json, readJson, sameOrigin, sessionCookie, sha256 } from "../../_lib/cms.js";

const MAX_ATTEMPTS = 5;

async function isRateLimited(db, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(ip);
  await db.prepare(`INSERT INTO login_attempts (ip_hash, attempt_count, window_started_at) VALUES (?1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(ip_hash) DO UPDATE SET
      attempt_count = CASE WHEN datetime(login_attempts.window_started_at) <= datetime('now', '-15 minutes') THEN 1 ELSE login_attempts.attempt_count + 1 END,
      window_started_at = CASE WHEN datetime(login_attempts.window_started_at) <= datetime('now', '-15 minutes') THEN CURRENT_TIMESTAMP ELSE login_attempts.window_started_at END`)
    .bind(key).run();
  const row = await db.prepare("SELECT attempt_count FROM login_attempts WHERE ip_hash = ?1").bind(key).first();
  return row.attempt_count > MAX_ATTEMPTS;
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (!env.DB || !env.CMS_ADMIN_EMAIL || !env.CMS_ADMIN_PASSWORD) return error("CMS chưa được cấu hình đầy đủ.", 503);
  if (env.CMS_ADMIN_PASSWORD.length < 16) return error("Mật khẩu quản trị phải có ít nhất 16 ký tự.", 503);
  if (await isRateLimited(env.DB, request)) return error("Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút.", 429);
  const parsed = await readJson(request, 4096);
  if (parsed.error) return error("Thông tin đăng nhập không hợp lệ.");
  const body = parsed.value;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || body.password.length > 256) {
    return error("Email hoặc mật khẩu không đúng.", 401);
  }

  const expectedEmail = env.CMS_ADMIN_EMAIL.trim().toLowerCase();
  const givenEmail = body.email.trim().toLowerCase();
  const expectedHash = await sha256(`${expectedEmail}\0${env.CMS_ADMIN_PASSWORD}`);
  const givenHash = await sha256(`${givenEmail}\0${body.password}`);
  if (!constantTimeEqual(givenHash, expectedHash)) return error("Email hoặc mật khẩu không đúng.", 401);

  const adminId = await sha256(expectedEmail);
  await env.DB.prepare(`INSERT INTO admins (admin_id, email, role, is_active, last_login_at)
    VALUES (?1, ?2, 'admin', 1, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET is_active = 1, last_login_at = CURRENT_TIMESTAMP`)
    .bind(adminId, expectedEmail).run();
  const admin = await env.DB.prepare("SELECT admin_id FROM admins WHERE email = ?1 AND is_active = 1").bind(expectedEmail).first();
  if (!admin) return error("Không thể khởi tạo phiên quản trị.", 503);
  const token = await createSession(env.DB, admin.admin_id);
  const key = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(key).run();
  return json({ authenticated: true, email: expectedEmail }, 200, { "Set-Cookie": sessionCookie(token) });
}
