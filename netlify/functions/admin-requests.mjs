// GET /api/admin/requests — list every request, newest first. Requires ADMIN_TOKEN.
import { getStore } from "@netlify/blobs";
import { json, isAdmin, STORE } from "../shared/http.js";

export default async req => {
  if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
  const store = getStore({ name: STORE, consistency: "strong" });
  const { blobs } = await store.list({ prefix: "req/" });
  const requests = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean)
    .sort((a, b) => b.created.localeCompare(a.created));
  return json({ requests });
};

export const config = { path: "/api/admin/requests" };
