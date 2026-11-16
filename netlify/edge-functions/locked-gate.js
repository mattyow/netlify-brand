// Guards everything under /locked/. Runs before static files are served.
// A browser gets in by entering the shared password at /access, which sets a signed cookie.
import { verify, readCookie, fingerprint } from "../shared/token.js";

export default async (request, context) => {
  const secret = Netlify.env.get("ACCESS_SECRET");
  const password = Netlify.env.get("LOCKED_PASSWORD");
  let ok = false;
  if (secret && password) {
    const session = await verify(readCookie(request.headers.get("cookie")), secret, { purpose: "session", version: await fingerprint(password) });
    ok = !!session;
  }

  if (!ok) {
    const url = new URL(request.url);
    const to = new URL("/access", url);
    to.searchParams.set("next", url.pathname + url.hash);
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
