import { canRegisterAdmin, constantTimeEqual, createSession, error, hashPassword, json, rateLimited, readJson, sameOrigin, sessionCookie, sha256 } from "../../_lib/cms.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return error("CMS chưa được cấu hình đầy đủ.", 503);
  return json({ available: await canRegisterAdmin(env) });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (!env.DB || !env.CMS_ADMIN_SETUP_TOKEN || env.CMS_ADMIN_SETUP_TOKEN.length < 32) return error("Đăng ký quản trị chưa được cấu hình.", 503);
  if (await rateLimited(env.DB, request)) return error("Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút.", 429);

  const parsed = await readJson(request, 4096);
  if (parsed.error) return error("Thông tin đăng ký không hợp lệ.");
  const { username: rawUsername, password, setup_token: setupToken } = parsed.value;
  if (typeof rawUsername !== "string" || typeof password !== "string" || typeof setupToken !== "string") return error("Thông tin đăng ký không hợp lệ.");
  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return error("Tên đăng nhập cần có 3–32 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.");
  if (password.length < 16 || password.length > 128) return error("Mật khẩu cần dài từ 16 đến 128 ký tự.");
  if (setupToken.length > 256) return error("Mã đăng ký không hợp lệ.", 403);
  const suppliedHash = await sha256(setupToken);
  const expectedHash = await sha256(env.CMS_ADMIN_SETUP_TOKEN);
  if (!constantTimeEqual(suppliedHash, expectedHash)) return error("Mã đăng ký không đúng.", 403);
  if (!(await canRegisterAdmin(env))) return error("Đăng ký đang khóa. Kiểm tra migration D1 và mã thiết lập một lần.", 409);

  const adminId = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const passwordHash = await hashPassword(password);
  const inserted = await env.DB.prepare(`INSERT INTO admins (admin_id, email, username, password_hash, role, is_active)
    SELECT ?1, ?2, ?2, ?3, 'admin', 1 WHERE NOT EXISTS (SELECT 1 FROM admins)`)
    .bind(adminId, username, passwordHash).run();
  if (!inserted.meta?.changes) return error("Đăng ký quản trị đã được khóa sau khi tạo tài khoản đầu tiên.", 409);

  const token = await createSession(env.DB, adminId);
  const ipKey = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?1").bind(ipKey).run();
  return json({ authenticated: true, username, role: "admin" }, 201, { "Set-Cookie": sessionCookie(token) });
}
