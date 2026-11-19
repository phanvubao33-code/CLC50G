import { clearSessionCookie, clearUserSessionCookie, cookieValue, error, json, sameOrigin, sha256 } from "../../_lib/cms.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  if (env.DB) {
    const adminToken = cookieValue(request, "__Host-memories_session");
    const userToken = cookieValue(request, "__Host-yearbook_user");
    if (adminToken && /^[a-f0-9]{64}$/.test(adminToken)) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?1").bind(await sha256(adminToken)).run();
    if (userToken && /^[a-f0-9]{64}$/.test(userToken)) await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?1").bind(await sha256(userToken)).run();
  }
  const response = json({ authenticated: false });
  response.headers.append("Set-Cookie", clearSessionCookie());
  response.headers.append("Set-Cookie", clearUserSessionCookie());
  return response;
}
