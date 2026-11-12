// GET /api/access/redeem?t=<invite> — swap a valid invite for a 90-day session cookie.
import { getStore } from "@netlify/blobs";
import { sign, verify, COOKIE, SESSION_TTL } from "../shared/token.js";
import { env, STORE } from "../shared/http.js";

const back = (req, reason) => Response.redirect(new URL(`/access?link=${reason}`, req.url), 302);

export default async req => {
  const secret = env("ACCESS_SECRET"), version = env("ACCESS_VERSION") || "1";
  const t = new URL(req.url).searchParams.get("t");
  const invite = await verify(t, secret, { purpose: "invite", version });
  if (!invite) return back(req, "expired");

  const store = getStore({ name: STORE, consistency: "strong" });
  const user = await store.get(`user/${invite.e}`, { type: "json" });
  if (user?.status !== "approved" || user.invite !== invite.n) return back(req, "invalid");

  const session = await sign({ e: invite.e, p: "session", x: Date.now() + SESSION_TTL, v: version, n: invite.n }, secret);
  await store.setJSON(`user/${invite.e}`, { ...user, redeemedAt: new Date().toISOString() });
  return new Response(null, { status: 302, headers: {
    Location: "/locked/",
    "Set-Cookie": `${COOKIE}=${session}; Path=/; Max-Age=${SESSION_TTL / 1000}; HttpOnly; Secure; SameSite=Lax`,
    "Cache-Control": "no-store"
  } });
};

export const config = { path: "/api/access/redeem" };
