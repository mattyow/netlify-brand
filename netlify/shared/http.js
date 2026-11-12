import { timingSafeEqual, createHash } from "node:crypto";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const env = name => (globalThis.Netlify?.env?.get(name) ?? process.env[name]) || "";

export function isAdmin(req) {
  const expected = env("ADMIN_TOKEN");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (expected.length < 24 || !got) return false;
  const a = createHash("sha256").update(got).digest(), b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
export const normEmail = e => clean(e, 200).toLowerCase();
export const STORE = "brand-access";
