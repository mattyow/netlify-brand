// GET /api/access/status — tells the page whether this browser is signed in.
import { verify, readCookie, fingerprint } from "../shared/token.js";
import { json, env } from "../shared/http.js";

export default async req => {
  const pw = env("LOCKED_PASSWORD"), secret = env("ACCESS_SECRET");
  if (!pw || !secret) return json({ access: false });
  const s = await verify(readCookie(req.headers.get("cookie")), secret, { purpose: "session", version: await fingerprint(pw) }).catch(() => null);
  return json({ access: !!s });
};

export const config = { path: "/api/access/status" };
