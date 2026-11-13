# Netlify Brand Hub

Public brand site with approval-gated locked assets. Static HTML + Netlify Functions + one Edge Function + Netlify Blobs.

## Deploy
Functions and the edge gate need a Git-connected site or the CLI (Netlify Drop won't run them).

1. Push this folder to a repo and create a site from it in Netlify (build settings come from `netlify.toml`), or run `npx netlify-cli deploy --build --prod`.
2. Set environment variables (Site configuration → Environment variables):
   - `ACCESS_SECRET` — random string, 32+ chars (`openssl rand -hex 32`). Signs links and cookies.
   - `ADMIN_TOKEN` — random string, 24+ chars. Used to sign in at `/admin`.
   - `ACCESS_VERSION` — optional, defaults to `1`. Change it to sign everyone out at once.
   - `NOTIFY_WEBHOOK_URL` — optional Slack incoming webhook; pings on each new request.
3. Redeploy after setting variables.

## Access flow
`/access` form → stored in Blobs (`brand-access` store) → brand team reviews at `/admin` → **Approve** creates a personal link (valid 14 days) → copy or "Email it" → redeeming sets a 90-day HttpOnly cookie → `/locked/*` is served only while that person is still approved.
- **New link** re-issues a link and signs out sessions from older links.
- **Revoke** blocks that person immediately.

## Add locked files
Drop files into `public/locked/` (they're gated by `netlify/edge-functions/locked-gate.js`):
- `public/locked/fonts/Systemia-Desktop.zip`, `Systemia-Web.zip`
Never put licensed files anywhere else in `public/`.

Large or many files? Keep the repo lean by storing them in a private location and linking from `src/pages/locked.html`.

## Fonts
The site uses the variable web fonts in `public/assets/fonts/systemia/` (Systemia and Systemia Mono, upright and italic), declared in `public/assets/css/hub.css`. Tokens: `--font-sans`, `--font-mono`.

## Gradient generator and API
- Generator: `public/locked/tools/gradient-generator/` (index, docs, fonts.css). Behind the lock. `#1`–`#24` in the URL opens that preset.
- API: `netlify/functions/gradient-api.mjs` + `netlify/lib/` at `/api/v1/*`. Needs env var `GRADIENT_API_KEY`. Uses `sharp` (native binaries configured in `netlify.toml`).
- Hub previews: `public/assets/gradients/NN-sq.webp` and `NN-wide.webp`, rendered by the same engine. Re-render after changing presets with `node scripts/render-gradients.mjs`.

## Other files to add
- Update `brand@netlify.com` in `src/shell.html` if needed.

## Edit pages
Pages live in `src/pages/*.html`; the shared layout is `src/shell.html`. `npm run build` (also run on deploy) writes them to `public/`. Shared styles: `public/assets/css/hub.css`; tokens: `public/assets/tokens/`.
