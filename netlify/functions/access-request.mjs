// POST /api/access/request — store a request for locked assets.
import { getStore } from "@netlify/blobs";
import { json, clean, normEmail, env, STORE } from "../shared/http.js";

const ASSETS = new Set(["fonts", "gradients", "figma", "templates"]);
const RELS = new Set(["Netlify employee", "Agency or contractor", "Technology partner", "Press or media", "Event or community organizer", "Other"]);

export default async req => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Send the form as JSON." }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: pretend success

  const r = {
    name: clean(b.name, 120), email: normEmail(b.email), org: clean(b.org, 160),
    relationship: clean(b.relationship, 60), use: clean(b.use, 1500),
    assets: Array.isArray(b.assets) ? [...new Set(b.assets.filter(a => ASSETS.has(a)))] : []
  };
  if (!r.name || !r.org || !r.use) return json({ error: "Fill in every required field." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return json({ error: "Enter a valid work email." }, 400);
  if (!RELS.has(r.relationship)) return json({ error: "Choose how you work with Netlify." }, 400);
  if (!r.assets.length) return json({ error: "Choose at least one asset." }, 400);

  const store = getStore({ name: STORE, consistency: "strong" });
  const user = await store.get(`user/${r.email}`, { type: "json" });
  if (user?.status === "approved") return json({ error: "This email already has access. Check your inbox for your sign-in link, or ask the brand team for a new one." }, 409);
  const open = await store.get(`pending/${r.email}`);
  if (open) return json({ error: "There's already a request pending for this email. We'll be in touch soon." }, 409);

  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { id, ...r, status: "pending", created: new Date().toISOString() };
  await store.setJSON(`req/${id}`, record);
  await store.set(`pending/${r.email}`, id);

  const hook = env("NOTIFY_WEBHOOK_URL"); // optional Slack-compatible incoming webhook
  if (hook) {
    const site = env("URL");
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `New brand asset request from ${r.name} (${r.org}, ${r.relationship}) for ${r.assets.join(", ")}. Review: ${site}/admin` }) }).catch(() => {});
  }
  return json({ ok: true }, 201);
};

export const config = { path: "/api/access/request" };
