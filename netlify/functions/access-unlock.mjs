// POST /api/access/unlock { password } — swap the shared password for a 90-day session cookie.
// The password lives only in the LOCKED_PASSWORD environment variable; the design team hands it out.
import { sign, fingerprint, COOKIE, SESSION_TTL, nonce } from "../shared/token.js";
import { json, env, safeEqual } from "../shared/http.js";

export default async req => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const expected = env("LOCKED_PASSWORD"), secret = env("ACCESS_SECRET");
  if (!expected || !secret) return json({ error: "Locked access isn't set up yet. Ask the design team." }, 503);

  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !safeEqual(password.trim(), expected)) {
    return json({ error: "That password isn't right. Check with the design team for the current one." }, 401);
  }
  const session = await sign({ p: "session", x: Date.now() + SESSION_TTL, v: await fingerprint(expected), n: nonce() }, secret);
  return json({ ok: true }, 200, {
    "Set-Cookie": `${COOKIE}=${session}; Path=/; Max-Age=${SESSION_TTL / 1000}; HttpOnly; Secure; SameSite=Lax`
  });
};

// Slows down password guessing: 10 tries per minute per IP.
export const config = { path: "/api/access/unlock", rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] } };
