import { error } from "../_lib/cms.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.IMAGES) return error("Kho ảnh chưa được cấu hình.", 503);
  let key;
  try {
    key = new URL(request.url).pathname.slice("/media/".length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return error("Đường dẫn ảnh không hợp lệ.", 400);
  }
  if (!key.startsWith("class-memory/") || key.includes("..")) return error("Không tìm thấy ảnh.", 404);
  const allowed = await env.DB.prepare("SELECT 1 FROM image_slots WHERE object_key = ?1 LIMIT 1").bind(key).first();
  if (!allowed) return error("Không tìm thấy ảnh.", 404);
  const object = await env.IMAGES.get(key);
  if (!object) return error("Không tìm thấy ảnh.", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
