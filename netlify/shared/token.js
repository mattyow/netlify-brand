// Signed tokens shared by Functions (Node) and Edge Functions (Deno). Web Crypto only.
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))
// Payload: { e: email, p: "invite" | "session", x: expiry (ms), v: ACCESS_VERSION, n: nonce }

export const COOKIE = "nf_brand_access";
export const INVITE_TTL = 14 * 24 * 3600 * 1000;
export const SESSION_TTL = 90 * 24 * 3600 * 1000;

const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function key(secret) {
  if (!secret || secret.length < 32) throw new Error("ACCESS_SECRET must be set and at least 32 characters.");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verify(token, secret, { purpose, version } = {}) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if (purpose && p.p !== purpose) return null;
    if (typeof p.x !== "number" || p.x < Date.now()) return null;
    if (version !== undefined && String(p.v) !== String(version)) return null;
    return p;
  } catch { return null; }
}

export function readCookie(header, name = COOKIE) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const nonce = () => b64u(crypto.getRandomValues(new Uint8Array(12)));
