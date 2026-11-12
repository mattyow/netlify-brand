// Guards everything under /locked/. Runs before static files are served.
import { getStore } from "@netlify/blobs";
import { verify, readCookie } from "../shared/token.js";

export default async (request, context) => {
  const secret = Netlify.env.get("ACCESS_SECRET");
  const version = Netlify.env.get("ACCESS_VERSION") || "1";
  const session = secret ? await verify(readCookie(request.headers.get("cookie")), secret, { purpose: "session", version }) : null;

  // Per-person revocation: the session is only honored while the person is still approved.
  let approved = false;
  if (session) {
    try {
      const user = await getStore("brand-access").get(`user/${session.e}`, { type: "json" });
      approved = user?.status === "approved" && user.invite === session.n;
    } catch { approved = false; }
  }

  if (!approved) {
    const url = new URL(request.url);
    const to = new URL("/access", url);
    to.searchParams.set("next", url.pathname);
    return Response.redirect(to, 302);
  }

  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  out.headers.set("Netlify-CDN-Cache-Control", "no-store");
  return out;
};

export const config = { path: ["/locked", "/locked/*"] };
