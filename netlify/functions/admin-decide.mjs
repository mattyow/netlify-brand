// POST /api/admin/decide { id, action: approve | deny | revoke | relink } — Requires ADMIN_TOKEN.
// approve/relink return a personal invite link valid for 14 days. Only the newest link works,
// and issuing a new one signs out sessions created from older links.
import { getStore } from "@netlify/blobs";
import { sign, INVITE_TTL, nonce } from "../shared/token.js";
import { json, isAdmin, env, STORE } from "../shared/http.js";

export default async req => {
  if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const { id, action } = await req.json().catch(() => ({}));
  if (!["approve", "deny", "revoke", "relink"].includes(action)) return json({ error: "Unknown action." }, 400);

  const store = getStore({ name: STORE, consistency: "strong" });
  const r = await store.get(`req/${id}`, { type: "json" });
  if (!r) return json({ error: "Request not found." }, 404);
  const now = new Date().toISOString();
  let link = null;

  if (action === "approve" || action === "relink") {
    const n = nonce(), version = env("ACCESS_VERSION") || "1";
    const t = await sign({ e: r.email, p: "invite", x: Date.now() + INVITE_TTL, v: version, n }, env("ACCESS_SECRET"));
    link = new URL(`/api/access/redeem?t=${encodeURIComponent(t)}`, env("URL") || req.url).toString();
    await store.setJSON(`user/${r.email}`, { status: "approved", requestId: r.id, invite: n, approvedAt: now });
    r.status = "approved";
  } else if (action === "deny") {
    r.status = "denied";
  } else if (action === "revoke") {
    await store.setJSON(`user/${r.email}`, { status: "revoked", requestId: r.id, revokedAt: now });
    r.status = "revoked";
  }
  r.decided = now;
  await store.setJSON(`req/${r.id}`, r);
  await store.delete(`pending/${r.email}`);
  return json({ request: r, link });
};

export const config = { path: "/api/admin/decide" };
