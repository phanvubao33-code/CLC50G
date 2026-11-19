import { clearSessionCookie, constantTimeEqual, createSession, createUserSession, error, hashPassword, json, rateLimited, readJson, sameOrigin, sessionCookie, sha256, userSessionCookie } from "../../_lib/cms.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (!env.DB) return error("Đăng ký tài khoản chưa được cấu hình.", 503);
  if (await rateLimited(env.DB, request)) return error("Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút.", 429);

  const parsed = await readJson(request, 4096);
  if (parsed.error) return error("Thông tin đăng ký không hợp lệ.");
  const { username: rawUsername, password } = parsed.value;
  if (typeof rawUsername !== "string" || typeof password !== "string" || rawUsername.length > 32 || password.length > 128) return error("Thông tin đăng ký không hợp lệ.");
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return error("Tên đăng nhập phải có 3–32 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.");
  if (password.length < 12) return error("Mật khẩu cần dài ít nhất 12 ký tự.");

  const adminUsername = "vubao07";
  const isAdminName = username === adminUsername;
  let role = "member";
  if (isAdminName) {
    if (!env.CMS_ADMIN_PASSWORD || env.CMS_ADMIN_PASSWORD.length < 16) return error("Tên đăng nhập này được dành riêng cho quản trị viên.", 409);
    const supplied = await sha256(`${username}\0${password}`);
    const expected = await sha256(`${adminUsername}\0${env.CMS_ADMIN_PASSWORD}`);
    if (!constantTimeEqual(supplied, expected)) return error("Tên đăng nhập này được dành riêng cho quản trị viên.", 409);
    role = "admin";
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    if (role === "admin") {
      const adminId = await sha256(username);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (user_id, username, password_hash, role) VALUES (?1, ?2, ?3, 'admin')").bind(userId, username, passwordHash),
        env.DB.prepare(`INSERT INTO admins (admin_id, email, role, is_active, last_login_at)
          VALUES (?1, ?2, 'admin', 1, CURRENT_TIMESTAMP)
          ON CONFLICT(email) DO UPDATE SET is_active = 1, last_login_at = CURRENT_TIMESTAMP`).bind(adminId, username),
      ]);
    } else {
      await env.DB.prepare("INSERT INTO users (user_id, username, password_hash, role) VALUES (?1, ?2, ?3, 'member')")
        .bind(userId, username, passwordHash).run();
    }
  } catch {
    return error("Tên đăng nhập này đã được sử dụng.", 409);
  }

  const userToken = await createUserSession(env.DB, userId);
  const response = json({ authenticated: true, username, role }, 201, { "Set-Cookie": userSessionCookie(userToken) });
  if (role === "admin") {
    const adminToken = await createSession(env.DB, await sha256(username));
    response.headers.append("Set-Cookie", sessionCookie(adminToken));
  } else {
    response.headers.append("Set-Cookie", clearSessionCookie());
  }
  const ipKey = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(ipKey).run();
  return response;
}
