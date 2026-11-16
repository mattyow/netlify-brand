// GET /api/access/signout — forget this browser's session.
import { COOKIE } from "../shared/token.js";

export default async () => new Response(null, { status: 302, headers: {
  Location: "/access?signedout=1",
  "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  "Cache-Control": "no-store"
} });

export const config = { path: "/api/access/signout" };
