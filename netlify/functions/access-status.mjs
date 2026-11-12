// GET /api/access/status — tells the page whether this browser has a live session.
import { getStore } from "@netlify/blobs";
import { verify, readCookie } from "../shared/token.js";
import { json, env, STORE } from "../shared/http.js";

export default async req => {
  const s = await verify(readCookie(req.headers.get("cookie")), env("ACCESS_SECRET"), { purpose: "session", version: env("ACCESS_VERSION") || "1" }).catch(() => null);
  if (!s) return json({ access: false });
  const user = await getStore(STORE).get(`user/${s.e}`, { type: "json" }).catch(() => null);
  return json(user?.status === "approved" && user.invite === s.n ? { access: true, email: s.e } : { access: false });
};

export const config = { path: "/api/access/status" };
