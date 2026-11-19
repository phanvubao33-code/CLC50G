const SESSION_COOKIE = "__Host-memories_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !!origin && origin === new URL(request.url).origin;
}

export async function readJson(request, limit = 16_384) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > limit) return { error: "Nội dung gửi lên vượt quá giới hạn." };
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: "Dữ liệu JSON không hợp lệ." };
    const decoder = new TextDecoder();
    let text = "", size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return { error: "Nội dung gửi lên vượt quá giới hạn." }; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Dữ liệu không hợp lệ." };
    return { value };
  } catch {
    return { error: "Dữ liệu JSON không hợp lệ." };
  }
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rateLimited(db, request, maxAttempts = 5) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(ip);
  await db.prepare(`INSERT INTO login_attempts (ip_hash, attempt_count, window_started_at) VALUES (?1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(ip_hash) DO UPDATE SET
      attempt_count = CASE WHEN datetime(login_attempts.window_started_at) <= datetime('now', '-15 minutes') THEN 1 ELSE login_attempts.attempt_count + 1 END,
      window_started_at = CASE WHEN datetime(login_attempts.window_started_at) <= datetime('now', '-15 minutes') THEN CURRENT_TIMESTAMP ELSE login_attempts.window_started_at END`)
    .bind(key).run();
  const row = await db.prepare("SELECT attempt_count FROM login_attempts WHERE ip_hash = ?1").bind(key).first();
  return row.attempt_count > maxAttempts;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const split = part.trim().indexOf("=");
    if (split < 0) continue;
    if (part.trim().slice(0, split) === name) return part.trim().slice(split + 1);
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return sessionCookie("", 0);
}

export async function createSession(db, adminId) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  await db.prepare(`INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
    VALUES (?1, ?2, datetime('now', '+8 hours'))`).bind(tokenHash, adminId).run();
  return token;
}

export async function requireAdmin(request, env) {
  if (!env.DB) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT a.admin_id, a.email, a.role
    FROM admin_sessions s JOIN admins a ON a.admin_id = s.admin_id
    WHERE s.token_hash = ?1 AND s.expires_at > CURRENT_TIMESTAMP AND a.is_active = 1`)
    .bind(tokenHash).first();
}

export function safeText(value, maxLength = 500) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
}

export async function requireMutation(request, env) {
  if (!sameOrigin(request)) return { response: error("Nguồn gửi yêu cầu không hợp lệ.", 403) };
  const admin = await requireAdmin(request, env);
  if (!admin) return { response: error("Vui lòng đăng nhập với tài khoản quản trị.", 401) };
  return { admin };
}
