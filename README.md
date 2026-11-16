# Netlify Brand Hub

Public brand site with password-locked assets. Static HTML + Netlify Functions + one Edge Function.

## Deploy
Connected to GitHub; pushing to `main` deploys. Functions and the edge gate need Git or CLI deploys (not Netlify Drop).

Environment variables (Project configuration → Environment variables, mark as secret, Functions scope):
- `LOCKED_PASSWORD` — the shared password the design team hands out. **Change it to sign everyone out** (e.g. when someone leaves or it gets shared too widely), then redeploy.
- `ACCESS_SECRET` — random string, 32+ chars (`openssl rand -hex 32`). Signs the session cookie. Never shared.
- `GRADIENT_API_KEY` — key for the gradient API at `/api/v1`.

## How locked access works
People ask the design team on Slack or at design@netlify.com → you send them the password → they enter it at `/access` → their browser gets a signed 90-day cookie → `/locked/*` is served only with a valid cookie for the current password (`netlify/edge-functions/locked-gate.js`). Sign out: `/api/access/signout`. Password tries are rate limited to 10 per minute per IP.

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

## Edit pages
Pages live in `src/pages/*.html`; the shared layout is `src/shell.html`. `npm run build` (also run on deploy) writes them to `public/`. Shared styles: `public/assets/css/hub.css`; tokens: `public/assets/tokens/`.
