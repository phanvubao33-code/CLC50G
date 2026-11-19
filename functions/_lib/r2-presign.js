import { AwsClient } from "aws4fetch";

const encoder = new TextEncoder();

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

export async function localUploadSignature(secret, value) {
  return hex(await hmac(encoder.encode(secret), value));
}

export async function presignR2Put({ accountId, accessKeyId, secretAccessKey, bucket, key, contentType, expiresSeconds = 300 }) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 S3 credentials are not configured.");
  const client = new AwsClient({ service: "s3", region: "auto", accessKeyId, secretAccessKey });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const signed = await client.sign(new Request(`${endpoint}?X-Amz-Expires=${expiresSeconds}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
  }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url.toString();
}
