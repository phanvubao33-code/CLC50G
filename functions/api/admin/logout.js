import { clearSessionCookie, error, json, requireAdmin, sameOrigin, sha256 } from "../../_lib/cms.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Nguồn gửi yêu cầu không hợp lệ.", 403);
  const admin = await requireAdmin(request, env);
  if (admin) {
    const cookie = request.headers.get("Cookie") || "";
    const match = /(?:^|;\s*)__Host-memories_session=([a-f0-9]{64})(?:;|$)/.exec(cookie);
    if (match) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?1").bind(await sha256(match[1])).run();
  }
  return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
}
