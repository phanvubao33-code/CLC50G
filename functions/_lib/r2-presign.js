const encoder = new TextEncoder();

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function amzTimestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export async function localUploadSignature(secret, value) {
  return hex(await hmac(encoder.encode(secret), value));
}

export async function presignR2Put({ accountId, accessKeyId, secretAccessKey, bucket, key, contentType, expiresSeconds = 300 }) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 S3 credentials are not configured.");
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const path = `/${awsEncode(bucket)}/${key.split("/").map(awsEncode).join("/")}`;
  const now = new Date();
  const timestamp = amzTimestamp(now);
  const date = timestamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${scope}`],
    ["X-Amz-Date", timestamp],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ].map(([name, value]) => [awsEncode(name), awsEncode(value)])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const normalizedContentType = contentType.trim().replace(/\s+/g, " ");
  const canonicalRequest = [
    "PUT",
    path,
    query,
    `content-type:${normalizedContentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    hex(await sha256(canonicalRequest)),
  ].join("\n");
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), date);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}
