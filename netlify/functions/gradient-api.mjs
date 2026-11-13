// Netlify Function: public HTTP API for the gradient generator.
// All /api/v1/* routes except the docs index require the shared key in GRADIENT_API_KEY.
import { timingSafeEqual, createHash } from 'node:crypto'
import sharp from 'sharp'
import {
  PAL, PAL_NAME, FORMATS, MODES, PRESETS, PRESET_TRIOS, TRANSPARENT, NUM_FIELDS, InputError,
  applyOverrides, randomGradient, describe, isOnBrand, offPalette, presetMatches, colorName, hashString, readNumber,
} from '../lib/gradients.mjs'
import { render, renderTile, analyzeTone } from '../lib/render.mjs'
import {
  COLLAGE_DEFAULTS, COLLAGE_RANGES, COLLAGE_SOURCES, COLLAGE_BACKGROUNDS, TEXTURE_DEFAULTS,
  genGradients, genLayout, tileBox,
} from '../lib/collage.mjs'
import { renderCollage } from '../lib/collage-render.mjs'
import { gradientSVG, collageSVG } from '../lib/svg.mjs'
import { RENDERER_SOURCE } from '../lib/renderer-source.mjs'

/* ---------- Usage policy (also published at /api/v1 and /locked/tools/gradient-generator/docs) ---------- */
export const RATE_LIMIT = { windowLimit: 120, windowSize: 60 }
const USAGE = {
  license: 'The shared key is licensed for internal Netlify brand work only. Do not publish it, embed it in public client-side code, or pass it to third parties. Use brand palette colors in any combination you like; the 24 presets are good starting points, not rules. strict=true rejects colors outside the palette.',
  rateLimit: `${RATE_LIMIT.windowLimit} requests per ${RATE_LIMIT.windowSize} seconds per client IP address. Requests over the limit get HTTP 429; wait a minute and retry.`,
  fairUse: 'Cache what you render: every deterministic response is immutable and has an ETag, so fetch each image once and revalidate with If-None-Match (a 304 costs no rendering). Use the batch endpoint for preset grids.',
  contact: 'Ask the generator owner for a higher limit or for your own key.',
}

export const config = {
  // Only /api/v1: the hub's own /api/access and /api/admin routes live beside it.
  path: ['/api/v1', '/api/v1/*'],
  rateLimit: { ...RATE_LIMIT, aggregateBy: ['ip', 'domain'] },
}

// Bump when rendering changes, so ETags of old images stop matching.
const RENDER_VERSION = 2
const MAX_SIDE = 4096
const MAX_PIXELS = 4096 * 2304 // covers 3840×2160 (4K UHD) and 4096×2160 (DCI 4K)
const MAX_BODY = 19.5 * 1024 * 1024 // streamed responses are capped at 20 MB
const BATCH_MAX_ITEMS = 48
const BATCH_MAX_PIXELS = 12_000_000
const IMAGE_TYPES = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg', svg: 'image/svg+xml' }
const RASTER = ['png', 'webp', 'jpeg']
const COLLAGE_MAX_TILES = 40
const COLLAGE_MAX_GRADIENTS = 48
const DEFAULT_QUALITY = { webp: 90, jpeg: 88 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Gradient-Mode, X-Gradient-Seed, X-Gradient-Width, X-Gradient-Height, X-Gradient-Tone, X-Gradient-Text-Color, X-Gradient-Luminance, X-Gradient-On-Brand, X-Collage-Tiles, X-Collage-Layout-Seed, X-Collage-Gradient-Seed',
}
const NO_STORE = { 'Cache-Control': 'no-store' }
// Deterministic responses never change for the same URL: clients keep them forever, and Netlify's
// CDN caches them per URL and API key (a request without the same key never sees a cached copy).
// `query` must stay in Netlify-Vary: any Netlify-Vary header replaces the default cache key, so
// without it every GET /api/v1/gradient would share one cached image whatever its parameters.
const IMMUTABLE = {
  'Cache-Control': 'private, max-age=31536000, immutable',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
  'Netlify-Vary': 'query,header=Authorization|X-API-Key',
  Vary: 'Authorization, X-API-Key',
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...NO_STORE, ...extra },
  })
const error = (status, code, message) => json({ error: { code, message } }, status)
class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code } }

// Stream bodies so large images aren't held to the 6 MB buffered-response limit.
function streamBody(buf) {
  const CHUNK = 1 << 20
  let i = 0
  return new ReadableStream({
    pull(ctrl) {
      if (i >= buf.length) return ctrl.close()
      ctrl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset + i, Math.min(CHUNK, buf.length - i)))
      i += CHUNK
    },
  })
}

/* ---------- Auth ---------- */
const digest = (s) => createHash('sha256').update(String(s)).digest()
function authorize(request) {
  const expected = process.env.GRADIENT_API_KEY
  if (!expected) return error(503, 'not_configured', 'The API key has not been configured on this site yet.')
  const auth = request.headers.get('authorization') || ''
  const provided = request.headers.get('x-api-key') || (/^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '')
  if (!provided) return error(401, 'missing_key', 'Send your API key as "Authorization: Bearer <key>" or "X-API-Key: <key>".')
  // Compare fixed-length digests so the check is constant-time regardless of key length.
  if (!timingSafeEqual(digest(provided), digest(expected))) return error(401, 'invalid_key', 'The API key is not valid.')
  return null
}

/* ---------- Input helpers ---------- */
const truthy = (v) => v === true || v === 1 || (typeof v === 'string' && ['1', 'true', 'yes', 'on', ''].includes(v.trim().toLowerCase()))
const flag = (v) => v != null && v !== false && truthy(v)

async function readBody(request) {
  let body
  try { body = await request.json() } catch { throw new InputError('Request body must be valid JSON') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Request body must be a JSON object')
  return body
}
// Accept the generator's "Preset JSON" export directly: { gradient: {...}, ... }
function flattenSpec(body) {
  const g = body.gradient && typeof body.gradient === 'object' ? body.gradient : {}
  const input = { ...g, ...body }
  delete input.gradient
  if (g.format && !body.format) input.format = g.format
  return input
}

/* ---------- Spec resolution ---------- */
/**
 * Turn raw request input into a fully resolved, canonical render spec.
 * Throws InputError for anything invalid.
 */
// "format" is both the size preset and, for convenience, the image type (format=webp). Mutates `input`.
function readOutput(input, defaultOutput, allowed) {
  let output = String(input.output || '').toLowerCase()
  const fmt = input.format != null ? String(input.format).toLowerCase() : ''
  if (fmt in IMAGE_TYPES || fmt === 'jpg') { if (!output) output = fmt; delete input.format }
  if (output === 'jpg') output = 'jpeg'
  output = output || defaultOutput
  if (!allowed.includes(output)) throw new InputError(`"output" must be ${allowed.slice(0, -1).join(', ')} or ${allowed.at(-1)}`)
  return output
}
function readSize(input, defaultSize) {
  let width, height, size = null
  const sizeName = input.size ?? input.format
  if (input.width != null || input.height != null) {
    width = Math.round(Number(input.width ?? input.height))
    height = Math.round(Number(input.height ?? input.width))
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16) throw new InputError('"width" and "height" must be at least 16')
  } else {
    size = String(sizeName || defaultSize).toLowerCase()
    const f = FORMATS[size]
    if (!f) throw new InputError(`"size" must be one of ${Object.keys(FORMATS).join(', ')}`)
    width = f.w; height = f.h
  }
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new InputError(`Images are limited to ${MAX_SIDE}px per side and ${(MAX_PIXELS / 1e6).toFixed(1)} megapixels in total (3840×2160 and 4096×2160 fit)`)
  }
  return { width, height, size }
}
function readLoopPosition(input) {
  if (input.t == null || input.t === '') return 0
  const t = Number(input.t)
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new InputError('"t" (loop position) must be between 0 and 1')
  return t
}
function readQuality(input) {
  if (input.quality == null || input.quality === '') return null
  const quality = Math.round(Number(input.quality))
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) throw new InputError('"quality" must be between 1 and 100')
  return quality
}

function resolveSpec(raw, { defaultOutput = 'png' } = {}) {
  const input = { ...raw }
  const strict = flag(input.strict)
  const presetColors = flag(input.presetColors)
  const output = readOutput(input, defaultOutput, ['png', 'webp', 'jpeg', 'svg', 'json', 'html'])

  // Starting point
  let base, source, randomKey = null
  if (input.random != null && input.random !== false && String(input.random).toLowerCase() !== 'false') {
    const fresh = input.random === true || ['', 'true'].includes(String(input.random).trim().toLowerCase())
    randomKey = fresh ? Math.random().toString(36).slice(2, 10) : String(input.random)
    base = randomGradient(randomKey, { presetColors })
    source = { type: 'random', random: randomKey, fresh }
  } else if (input.preset != null && input.preset !== '') {
    const n = Number(input.preset)
    if (!Number.isInteger(n) || n < 1 || n > PRESETS.length) throw new InputError(`"preset" must be an integer from 1 to ${PRESETS.length}`)
    base = PRESETS[n - 1]
    source = { type: 'preset', preset: n }
  } else {
    base = PRESETS[0]
    source = input.mode || input.colors ? { type: 'custom', base: 'preset 1' } : { type: 'preset', preset: 1 }
  }
  if (Array.isArray(input.colors) ? input.colors.length > 3 : String(input.colors ?? '').split(',').filter(Boolean).length > 3) {
    throw new InputError('Gradients use exactly 3 colors, matching the brand guideline tiles and the generator. See "Why three colors" in the docs.')
  }
  const gradient = applyOverrides(base, input)
  const onBrand = isOnBrand(gradient.colors)
  if (strict && !onBrand) {
    throw new InputError(`strict=true only accepts brand palette colors; ${offPalette(gradient.colors).join(', ')} is not in the palette. Any combination of palette colors is fine (see GET /api/v1/palette).`)
  }

  const { width, height, size } = readSize(input, 'square')
  const t = readLoopPosition(input)

  const mask = flag(input.mask)
  const tile = flag(input.tile)
  const hasAlpha = !mask && gradient.colors.includes(TRANSPARENT)

  // Quality applies to webp/jpeg (and to the image URLs returned by json)
  const quality = readQuality(input)

  if (output === 'jpeg' && hasAlpha) throw new InputError('JPEG has no transparency. Use output=webp or png with transparent colors.')
  if (output === 'html' && (mask || tile || hasAlpha)) throw new InputError('The HTML embed supports neither mask, tile nor transparent colors. Use an image output.')
  if (output === 'svg' && (mask || tile || hasAlpha)) throw new InputError('SVG output supports neither mask, tile nor transparent colors. Use png or webp.')

  return { kind: 'gradient', gradient, source, strict, onBrand, presetMatch: presetMatches(gradient.colors), width, height, size, t, output, quality, mask, tile, hasAlpha }
}

const canonical = (spec, output = spec.output) => ({
  v: RENDER_VERSION, output, quality: output === 'webp' || output === 'jpeg' ? spec.quality ?? DEFAULT_QUALITY[output] : null,
  width: spec.width, height: spec.height, t: spec.t, mask: spec.mask, tile: spec.tile,
  gradient: { ...describe(spec.gradient), colorNames: undefined },
})
const etagFor = (spec, output) =>
  `"${spec.kind === 'collage' ? 'c' : 'g'}${RENDER_VERSION}-${createHash('sha256').update(JSON.stringify((spec.kind === 'collage' ? collageCanonical : canonical)(spec, output))).digest('base64url').slice(0, 32)}"`
const deterministic = (spec) => !(spec.source.type === 'random' && spec.source.fresh)

// Query string that reproduces exactly this gradient, so random results can be saved and refetched.
function reproduceQuery(spec, output) {
  const g = spec.gradient
  const q = new URLSearchParams({
    output, mode: g.mode, colors: g.colors.join(','), stops: g.stops.join(','), angle: g.angle, center: g.center.join(','),
    sizeX: g.sizeX, sizeY: g.sizeY, amp: g.amp, freq: g.freq, warp: g.warp, warpScale: g.warpScale,
    grain: g.grain, motion: g.motion, loop: g.loop, seed: g.seed, points: g.points.flat().join(','), radii: g.radii.join(','),
  })
  if (spec.size) q.set('size', spec.size); else { q.set('width', spec.width); q.set('height', spec.height) }
  if (spec.t) q.set('t', spec.t)
  if (spec.mask) q.set('mask', 'true')
  if (spec.tile) q.set('tile', 'true')
  if (spec.quality != null && (output === 'webp' || output === 'jpeg')) q.set('quality', spec.quality)
  return q
}

/* ---------- Rendering ---------- */
async function renderImage(spec) {
  if (spec.kind === 'collage') return renderCollageImage(spec)
  const { gradient, width, height, t, mask, tile, hasAlpha } = spec
  if (spec.output === 'svg') return checkSize(spec, Buffer.from(await gradientSVG(gradient, width, height, t)))
  const channels = mask ? 1 : hasAlpha ? 4 : 3
  const raw = (tile ? renderTile : render)(gradient, width, height, t * Math.PI * 2, { mask, channels })
  return encode(spec, raw, channels)
}
async function renderCollageImage(spec) {
  const { collage, width, height, t } = spec
  if (spec.output === 'svg') return checkSize(spec, Buffer.from(await collageSVG(collage, width, height, t)))
  const { data, channels } = await renderCollage(collage, width, height, t, { opaque: spec.output === 'jpeg' })
  return encode(spec, data, channels)
}
function checkSize(spec, buf) {
  if (buf.length > MAX_BODY) {
    throw new HttpError(413, 'too_large', `The ${spec.output.toUpperCase()} would be ${(buf.length / 1048576).toFixed(1)} MB, over the 20 MB response limit. Use output=webp or jpeg, or a smaller size.`)
  }
  return buf
}
async function encode(spec, raw, channels) {
  const { width, height } = spec
  let img = sharp(raw, { raw: { width, height, channels } })
  if (spec.output === 'webp') img = img.webp({ quality: spec.quality ?? DEFAULT_QUALITY.webp, effort: 3, alphaQuality: 100 })
  else if (spec.output === 'jpeg') img = img.jpeg({ quality: spec.quality ?? DEFAULT_QUALITY.jpeg, mozjpeg: true, chromaSubsampling: '4:4:4' })
  else img = img.png({ compressionLevel: 6, adaptiveFiltering: false })
  return checkSize(spec, await img.toBuffer())
}

const toneFor = (spec) => spec.mask ? null : analyzeTone(spec.gradient, spec.width, spec.height, spec.t * Math.PI * 2, { tile: spec.tile, hasAlpha: spec.hasAlpha })

function metaHeaders(spec, tone) {
  const h = {
    'X-Gradient-Mode': spec.gradient.mode,
    'X-Gradient-Seed': String(spec.gradient.seed),
    'X-Gradient-Width': String(spec.width),
    'X-Gradient-Height': String(spec.height),
    'X-Gradient-On-Brand': String(spec.onBrand),
  }
  if (tone) {
    h['X-Gradient-Tone'] = tone.tone
    h['X-Gradient-Text-Color'] = tone.textColor
    h['X-Gradient-Luminance'] = String(tone.luminance)
  }
  return h
}

function describeSpec(spec, origin) {
  const tone = toneFor(spec)
  const urls = {}
  const outs = spec.hasAlpha ? ['png', 'webp'] : spec.mask || spec.tile ? ['png', 'webp', 'jpeg'] : ['png', 'webp', 'jpeg', 'svg']
  for (const out of outs) urls[out] = `${origin}/api/v1/gradient?${reproduceQuery(spec, out)}`
  return {
    source: spec.source.type === 'random' ? { type: 'random', random: spec.source.random } : spec.source,
    onBrand: spec.onBrand,
    presetMatch: spec.presetMatch,
    width: spec.width, height: spec.height, size: spec.size, t: spec.t,
    mask: spec.mask, tile: spec.tile, transparent: spec.hasAlpha,
    tone,
    gradient: describe(spec.gradient),
    urls,
    pngUrl: urls.png,
  }
}

const filename = (spec) => spec.kind === 'collage'
  ? `netlify-collage-${spec.size || `${spec.width}x${spec.height}`}.${spec.output === 'jpeg' ? 'jpg' : spec.output}`
  : `netlify-gradient-${spec.size || `${spec.width}x${spec.height}`}-${spec.gradient.mode}${spec.mask ? '-mask' : ''}${spec.tile ? '-tile' : ''}.${spec.output === 'jpeg' ? 'jpg' : spec.output}`

function embedHTML(g) {
  const S = JSON.stringify(describe(g)).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Netlify gradient</title>
<style>html,body{margin:0;height:100%;background:${g.colors[0]}}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="g" aria-hidden="true"></canvas>
<script>
${RENDERER_SOURCE}
const S = ${S};
const c = document.getElementById('g'), r = new Renderer(c, false);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let t = 0, last = performance.now();
function fit(){ const d = Math.min(devicePixelRatio || 1, 2); r.size(Math.max(1, Math.round(c.clientWidth*d)), Math.max(1, Math.round(c.clientHeight*d))); }
new ResizeObserver(fit).observe(c); fit();
(function loop(now){ if(!still) t = (t + (now - last)/1000/S.loop*Math.PI*2) % (Math.PI*2); last = now; r.draw(S, t, null); requestAnimationFrame(loop); })(last);
</script></body></html>`
}

/* ---------- Collage ---------- */
// Accept the generator's collage "Preset JSON" export directly: { collage: {...}, texture: {...}, format }
const COLLAGE_ALIASES = { size: 'tileSize', scallop: 'edges', bg: 'background', gradSeed: 'gradientSeed', grads: 'gradients' }
function flattenCollage(body) {
  const c = body.collage && typeof body.collage === 'object' && !Array.isArray(body.collage) ? body.collage : {}
  const tex = body.texture && typeof body.texture === 'object' ? body.texture : {}
  const input = {}
  for (const [k, v] of Object.entries(c)) input[COLLAGE_ALIASES[k] || k] = v
  Object.assign(input, tex, body)
  delete input.collage; delete input.texture; delete input.text; delete input.generator
  if (body.bg != null && body.background == null) input.background = body.bg
  return input
}
// Integers are used as-is (the generator's seeds); any other string is hashed into a seed.
function readSeed(v, name) {
  const str = String(v).trim()
  if (!str) throw new InputError(`"${name}" must not be empty`)
  if (/^\d{1,9}$/.test(str)) return Number(str)
  return hashString(str)
}
const TILE_NUMBERS = { cx: [-1, 2], cy: [-1, 2], w: [0.01, 3], h: [0.01, 3], edgeRoll: [0, 1], sideRoll: [0, 1], styleRoll: [0, 1], amp: [0.001, 0.1], per: [0.005, 0.5], phase: [-100, 100], warpMul: [0, 3] }
const TILE_DEFAULTS = { edgeRoll: 1, sideRoll: 0.5, styleRoll: 0, amp: 0.018, per: 0.041, phase: 0, warpMul: 1 }
function readTiles(list) {
  if (!Array.isArray(list) || !list.length) throw new InputError('"tiles" must be a non-empty array')
  if (list.length > COLLAGE_MAX_TILES) throw new InputError(`A collage can have at most ${COLLAGE_MAX_TILES} tiles`)
  return list.map((t, i) => {
    if (!t || typeof t !== 'object') throw new InputError(`tiles[${i}] must be an object`)
    const out = { small: !!t.small }
    for (const [k, range] of Object.entries(TILE_NUMBERS)) {
      const v = t[k] ?? TILE_DEFAULTS[k]
      if (v == null) throw new InputError(`tiles[${i}] needs "${k}"`)
      out[k] = readNumber(v, `tiles[${i}].${k}`, range)
    }
    return out
  })
}

function resolveCollage(raw, { defaultOutput = 'png' } = {}) {
  const input = { ...raw }
  const strict = flag(input.strict)
  const presetColors = flag(input.presetColors)
  const output = readOutput(input, defaultOutput, ['png', 'webp', 'jpeg', 'svg', 'json'])
  const { width, height, size } = readSize(input, 'wide')
  const t = readLoopPosition(input)
  const quality = readQuality(input)

  const settings = { ...COLLAGE_DEFAULTS }
  for (const [k, range] of Object.entries(COLLAGE_RANGES)) {
    if (input[k] != null && input[k] !== '') settings[k] = readNumber(input[k], k, range)
  }
  settings.count = Math.round(settings.count)
  if (input.source != null) {
    settings.source = String(input.source).toLowerCase()
    if (!COLLAGE_SOURCES.includes(settings.source)) throw new InputError(`"source" must be ${COLLAGE_SOURCES.join(', ')}`)
  }
  if (input.background != null) {
    settings.background = String(input.background).toLowerCase()
    if (!COLLAGE_BACKGROUNDS.includes(settings.background)) throw new InputError(`"background" must be ${COLLAGE_BACKGROUNDS.join(' or ')}`)
  }
  if (output === 'jpeg' && settings.background === 'transparent') throw new InputError('JPEG has no transparency. Use output=png, webp or svg, or background=white.')

  // Seeds: random=true draws new ones, random=<text> derives both from the text, explicit seeds win.
  let fresh = false, randomKey = null
  if (input.random != null && input.random !== false && String(input.random).toLowerCase() !== 'false') {
    fresh = input.random === true || ['', 'true'].includes(String(input.random).trim().toLowerCase())
    randomKey = fresh ? Math.random().toString(36).slice(2, 10) : String(input.random)
    settings.layoutSeed = hashString(randomKey + ':layout') % 1e6
    settings.gradientSeed = hashString(randomKey + ':gradients') % 1e6
  }
  const hasLayoutSeed = input.layoutSeed != null && input.layoutSeed !== ''
  const hasGradientSeed = input.gradientSeed != null && input.gradientSeed !== ''
  if (hasLayoutSeed) settings.layoutSeed = readSeed(input.layoutSeed, 'layoutSeed')
  if (hasGradientSeed) settings.gradientSeed = readSeed(input.gradientSeed, 'gradientSeed')

  const texture = { ...TEXTURE_DEFAULTS }
  for (const k of Object.keys(TEXTURE_DEFAULTS)) {
    if (input[k] != null && input[k] !== '') texture[k] = readNumber(input[k], k, NUM_FIELDS[k])
  }

  // Tiles and gradients: supplied ones (from a generator export) are used exactly; otherwise generated from the seeds.
  const customTiles = input.tiles != null
  const tiles = customTiles ? readTiles(input.tiles) : genLayout(settings, width, height)
  if (!tiles.length) throw new InputError('No tiles fit this size. Lower "tileSize" or use a larger canvas.')
  const customGrads = input.gradients != null
  let grads
  if (customGrads) {
    if (!Array.isArray(input.gradients) || !input.gradients.length) throw new InputError('"gradients" must be a non-empty array of gradients')
    if (input.gradients.length > COLLAGE_MAX_GRADIENTS) throw new InputError(`A collage can have at most ${COLLAGE_MAX_GRADIENTS} gradients`)
    grads = input.gradients.map((g, i) => {
      if (!g || typeof g !== 'object' || Array.isArray(g)) throw new InputError(`gradients[${i}] must be an object`)
      try { return applyOverrides(PRESETS[0], g) } catch (e) { throw e instanceof InputError ? new InputError(`gradients[${i}]: ${e.message}`) : e }
    })
  } else grads = genGradients(settings, { presetColors })
  const used = tiles.map((_, i) => grads[i % grads.length])
  if (used.some((g) => g.colors.includes(TRANSPARENT))) throw new InputError('Collage tiles can’t use transparent colors. Use background=transparent for a see-through collage.')
  const onBrand = used.every((g) => isOnBrand(g.colors))
  if (strict && !onBrand) throw new InputError(`strict=true only accepts brand palette colors; ${[...new Set(used.flatMap((g) => offPalette(g.colors)))].join(', ')} is not in the palette.`)

  const tilePixels = tiles.reduce((n, tl) => { const b = tileBox(tl, width, height); return n + b.w * b.h }, 0)
  if (tilePixels > MAX_PIXELS) throw new InputError(`The tiles cover ${(tilePixels / 1e6).toFixed(1)} megapixels in total, over the ${(MAX_PIXELS / 1e6).toFixed(1)} limit. Use fewer or smaller tiles, or a smaller size.`)

  // A fresh random collage is only reproducible when nothing random is left in it.
  fresh = fresh && !((hasLayoutSeed || customTiles) && (hasGradientSeed || customGrads))
  const type = customTiles || customGrads ? 'custom' : randomKey != null ? 'random' : 'seeds'
  return {
    kind: 'collage', output, quality, width, height, size, t, strict, presetColors, onBrand,
    source: { type, random: type === 'random' ? randomKey : undefined, fresh, customTiles, customGradients: customGrads },
    settings,
    collage: { tiles, grads, texture, edges: settings.edges, background: settings.background },
  }
}

const collageCanonical = (spec, output = spec.output) => ({
  v: RENDER_VERSION, kind: 'collage', output, quality: output === 'webp' || output === 'jpeg' ? spec.quality ?? DEFAULT_QUALITY[output] : null,
  width: spec.width, height: spec.height, t: spec.t, edges: spec.collage.edges, background: spec.collage.background,
  texture: spec.collage.texture,
  tiles: spec.collage.tiles.map((tl) => [tl.small, ...Object.keys(TILE_NUMBERS).map((k) => tl[k])]),
  grads: spec.collage.tiles.map((_, i) => ({ ...describe(spec.collage.grads[i % spec.collage.grads.length]), colorNames: undefined })),
})

function collageQuery(spec, output) {
  const st = spec.settings, tx = spec.collage.texture
  const q = new URLSearchParams({
    output, count: st.count, tileSize: st.tileSize, smallShare: st.smallShare, smallScale: st.smallScale, variance: st.variance,
    edges: st.edges, source: st.source, background: st.background, layoutSeed: st.layoutSeed, gradientSeed: st.gradientSeed,
    grain: tx.grain, motion: tx.motion, warp: tx.warp, warpScale: tx.warpScale, loop: tx.loop,
  })
  if (spec.size) q.set('size', spec.size); else { q.set('width', spec.width); q.set('height', spec.height) }
  if (spec.t) q.set('t', spec.t)
  if (spec.strict) q.set('strict', 'true')
  if (spec.presetColors) q.set('presetColors', 'true')
  if (spec.quality != null && (output === 'webp' || output === 'jpeg')) q.set('quality', spec.quality)
  return q
}

function describeCollage(spec, origin) {
  const { collage, settings, width, height } = spec
  const out = {
    kind: 'collage',
    source: { type: spec.source.type, random: spec.source.random },
    onBrand: spec.onBrand,
    width, height, size: spec.size, t: spec.t,
    settings,
    texture: collage.texture,
    tiles: collage.tiles.map((tl, i) => {
      const g = collage.grads[i % collage.grads.length]
      return { index: i + 1, box: tileBox(tl, width, height), small: tl.small, toothed: tl.edgeRoll < collage.edges, presetMatch: presetMatches(g.colors), gradient: describe(g) }
    }),
    // POST this back to /api/v1/collage (or open it in the generator's format) to get exactly this collage.
    preset: {
      collage: { ...settings, tiles: collage.tiles, gradients: collage.grads.map(describe) },
      texture: collage.texture,
      ...(spec.size ? { size: spec.size } : { width, height }),
    },
  }
  // Seed URLs only reproduce collages that were generated from seeds, not supplied tiles or gradients.
  if (!spec.source.customTiles && !spec.source.customGradients) {
    out.urls = {}
    for (const o of collage.background === 'transparent' ? ['png', 'webp', 'svg'] : ['png', 'webp', 'jpeg', 'svg']) out.urls[o] = `${origin}/api/v1/collage?${collageQuery(spec, o)}`
  }
  return out
}

function collageHeaders(spec) {
  return {
    'X-Collage-Tiles': String(spec.collage.tiles.length),
    'X-Collage-Layout-Seed': String(spec.settings.layoutSeed),
    'X-Collage-Gradient-Seed': String(spec.settings.gradientSeed),
    'X-Gradient-Width': String(spec.width),
    'X-Gradient-Height': String(spec.height),
    'X-Gradient-On-Brand': String(spec.onBrand),
  }
}

async function collageRoute(request, url) {
  const input = Object.fromEntries(url.searchParams.entries())
  if (request.method === 'POST') Object.assign(input, flattenCollage(await readBody(request)))
  const spec = resolveCollage(input)
  const fixed = !spec.source.fresh
  const etag = etagFor(spec, spec.output)
  const cache = fixed ? { ...IMMUTABLE, ETag: etag } : { ...NO_STORE, ETag: etag }
  if (fixed && etagMatches(request, etag)) return new Response(null, { status: 304, headers: { ...CORS, ...cache } })
  if (spec.output === 'json') return json(describeCollage(spec, url.origin), 200, { ...collageHeaders(spec), ...cache })
  const buf = await renderImage(spec)
  return new Response(streamBody(buf), {
    headers: {
      'Content-Type': IMAGE_TYPES[spec.output], 'Content-Length': String(buf.length),
      'Content-Disposition': `inline; filename="${filename(spec)}"`,
      ...CORS, ...collageHeaders(spec), ...cache,
    },
  })
}

/* ---------- Routes ---------- */
function etagMatches(request, etag) {
  const inm = request.headers.get('if-none-match')
  if (!inm) return false
  return inm.trim() === '*' || inm.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag)
}

async function gradientRoute(request, url) {
  const input = Object.fromEntries(url.searchParams.entries())
  if (request.method === 'POST') Object.assign(input, flattenSpec(await readBody(request)))
  const spec = resolveSpec(input)
  const fixed = deterministic(spec)
  const etag = etagFor(spec, spec.output)
  const cache = fixed ? { ...IMMUTABLE, ETag: etag } : { ...NO_STORE, ETag: etag }

  if (fixed && etagMatches(request, etag)) return new Response(null, { status: 304, headers: { ...CORS, ...cache } })

  if (spec.output === 'json') {
    const body = describeSpec(spec, url.origin)
    return json(body, 200, { ...metaHeaders(spec, body.tone), ...cache })
  }
  if (spec.output === 'html') {
    return new Response(embedHTML(spec.gradient), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS, ...metaHeaders(spec, null), ...cache },
    })
  }
  const buf = await renderImage(spec)
  return new Response(streamBody(buf), {
    headers: {
      'Content-Type': IMAGE_TYPES[spec.output], 'Content-Length': String(buf.length),
      'Content-Disposition': `inline; filename="${filename(spec)}"`,
      ...CORS, ...metaHeaders(spec, toneFor(spec)), ...cache,
    },
  })
}

async function batchRoute(request, url) {
  const body = await readBody(request)
  const items = body.items
  if (!Array.isArray(items) || !items.length) throw new InputError('"items" must be a non-empty array of gradient requests')
  if (items.length > BATCH_MAX_ITEMS) throw new InputError(`A batch can hold at most ${BATCH_MAX_ITEMS} items`)
  const defaults = body.defaults && typeof body.defaults === 'object' ? body.defaults : {}

  // Resolve everything first so a bad batch fails before any rendering.
  const specs = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { index, error: { code: 'invalid_request', message: 'Each item must be an object' } }
    try {
      const isCollage = item.kind === 'collage' || (item.collage && typeof item.collage === 'object')
      const spec = isCollage
        ? resolveCollage({ ...defaults, ...flattenCollage(item) }, { defaultOutput: 'webp' })
        : resolveSpec({ ...defaults, ...flattenSpec(item) }, { defaultOutput: 'webp' })
      if (spec.output === 'html') throw new InputError('Batches return images or JSON; output=html is not supported')
      return { index, id: item.id, spec }
    } catch (e) {
      if (e instanceof InputError) return { index, id: item.id, error: { code: 'invalid_request', message: e.message } }
      throw e
    }
  })
  const pixels = specs.reduce((n, s) => n + (s.spec && s.spec.output !== 'json' && s.spec.output !== 'svg' ? s.spec.width * s.spec.height : 0), 0)
  if (pixels > BATCH_MAX_PIXELS) throw new InputError(`A batch can render at most ${BATCH_MAX_PIXELS / 1e6} megapixels in total; this one asks for ${(pixels / 1e6).toFixed(1)}. Split it or use smaller sizes.`)

  const results = []
  let bytes = 0
  for (const s of specs) {
    if (s.error) { results.push({ index: s.index, id: s.id, ok: false, error: s.error }); continue }
    const info = s.spec.kind === 'collage' ? describeCollage(s.spec, url.origin) : describeSpec(s.spec, url.origin)
    const entry = { index: s.index, id: s.id, ok: true, etag: etagFor(s.spec, s.spec.output), ...info }
    if (s.spec.output !== 'json') {
      const buf = await renderImage(s.spec)
      bytes += buf.length * 1.34
      if (bytes > MAX_BODY) throw new HttpError(413, 'too_large', 'The batch response would exceed 20 MB. Use output=webp, lower quality or fewer items.')
      entry.contentType = IMAGE_TYPES[s.spec.output]
      entry.bytes = buf.length
      entry.data = `data:${entry.contentType};base64,${buf.toString('base64')}`
    }
    results.push(entry)
  }
  const out = Buffer.from(JSON.stringify({ count: results.length, items: results }))
  return new Response(streamBody(out), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...NO_STORE } })
}

function docs(origin) {
  return {
    name: 'Netlify gradient generator API',
    version: 'v1',
    docsPage: `${origin}/locked/tools/gradient-generator/docs`,
    authentication: 'Send the shared key as "Authorization: Bearer <key>" or "X-API-Key: <key>". Every endpoint except this one requires it.',
    usage: USAGE,
    endpoints: {
      'GET /api/v1': 'This summary (no key needed).',
      'GET /api/v1/presets': 'The 24 built-in presets with their full parameters.',
      'GET /api/v1/palette': 'Brand palette colors, usable by name in "colors".',
      'GET /api/v1/preset-colors': 'The color trios used by the 24 presets: suggestions to start from, not rules. Also at /api/v1/combinations.',
      'GET|POST /api/v1/gradient': 'Generate one gradient. Returns a PNG by default; output=svg returns a layered, animated SVG.',
      'GET|POST /api/v1/collage': 'Generate a collage of gradient tiles. Returns a PNG by default; also webp, jpeg, svg (one layer per tile) or json.',
      'POST /api/v1/batch': `Generate up to ${BATCH_MAX_ITEMS} gradients or collages in one call (images returned as base64 data URIs). Mark collage items with "kind": "collage".`,
    },
    gradientParameters: {
      output: 'png (default) | webp | jpeg | svg | json | html. format=webp|jpeg|png|svg also works. svg is layered and animates in browsers; it supports neither mask, tile nor transparent colors.',
      quality: `1-100 for webp (default ${DEFAULT_QUALITY.webp}) and jpeg (default ${DEFAULT_QUALITY.jpeg}).`,
      preset: `Start from preset 1-${PRESETS.length} (default 1).`,
      random: 'Random gradient. Any string is a reproducible seed (random=hello); random=true gives a new one each call.',
      strict: 'true rejects colors outside the brand palette. Any combination of palette colors is allowed.',
      presetColors: 'With random, true uses one of the presets\' color trios instead of any palette colors.',
      size: `${Object.keys(FORMATS).join(' | ')} (default square). Also accepted as "format". Ignored when width/height are set.`,
      'width, height': `Custom size up to ${MAX_SIDE}px per side and ${(MAX_PIXELS / 1e6).toFixed(1)} megapixels.`,
      t: 'Position within the animation loop, 0-1 (default 0).',
      tile: 'true makes the image repeat seamlessly in both directions.',
      mask: 'true returns a grayscale mask (black = first color, white = last) for masking your own shapes.',
      mode: MODES.join(' | '),
      colors: 'Exactly three colors: hex, palette names or "transparent" (gives an alpha channel in png/webp).',
      'stops, angle, center, sizeX, sizeY, points, radii, amp, freq, warp, warpScale, grain, motion, loop, seed': 'Same as the generator UI. See the docs page.',
    },
    collageParameters: {
      output: 'png (default) | webp | jpeg | svg | json.',
      size: `${Object.keys(FORMATS).join(' | ')} (default wide), or width and height.`,
      count: `Number of tiles, ${COLLAGE_RANGES.count.join('-')} (default ${COLLAGE_DEFAULTS.count}).`,
      tileSize: `Large tile size as a share of the short edge, ${COLLAGE_RANGES.tileSize.join('-')} (default ${COLLAGE_DEFAULTS.tileSize}).`,
      smallShare: `Share of tiles that are small, ${COLLAGE_RANGES.smallShare.join('-')} (default ${COLLAGE_DEFAULTS.smallShare}).`,
      smallScale: `Small tile size relative to large ones, ${COLLAGE_RANGES.smallScale.join('-')} (default ${COLLAGE_DEFAULTS.smallScale}).`,
      variance: `Random size range, ${COLLAGE_RANGES.variance.join('-')} (default ${COLLAGE_DEFAULTS.variance}).`,
      edges: `Chance a tile gets toothed edges, 0-1 (default ${COLLAGE_DEFAULTS.edges}).`,
      source: `${COLLAGE_SOURCES.join(' | ')}: where tile gradients come from (default ${COLLAGE_DEFAULTS.source}).`,
      background: `${COLLAGE_BACKGROUNDS.join(' | ')} (default ${COLLAGE_DEFAULTS.background}).`,
      'layoutSeed, gradientSeed': 'Seeds for the layout and the tile gradients (integers match the generator). random=true draws new ones; random=<text> derives both from the text.',
      'grain, motion, warp, warpScale, loop': 'Texture applied to every tile.',
      t: 'Position within the animation loop, 0-1 (default 0).',
      strict: 'true rejects tile gradients with colors outside the brand palette.',
      presetColors: 'true makes random tile gradients use the presets\' color trios.',
      body: 'POST also accepts the generator\'s collage Preset JSON ({ collage, texture, format }); its tiles and gradients are used exactly.',
    },
    caching: 'Deterministic requests (preset or seed plus parameters) return Cache-Control: immutable and an ETag; send If-None-Match to get a 304. random=true responses are no-store.',
  }
}

export default async function handler(request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })

  if (path === '/api' || path === '/api/v1') {
    if (request.method !== 'GET') return error(405, 'method_not_allowed', 'Use GET.')
    return json(docs(url.origin))
  }

  const routes = {
    '/api/v1/presets': ['GET'],
    '/api/v1/palette': ['GET'],
    '/api/v1/combinations': ['GET'],
    '/api/v1/preset-colors': ['GET'],
    '/api/v1/gradient': ['GET', 'POST'],
    '/api/v1/collage': ['GET', 'POST'],
    '/api/v1/batch': ['POST'],
  }
  if (!routes[path]) return error(404, 'not_found', 'Unknown endpoint. See /api/v1 for documentation.')
  if (!routes[path].includes(request.method)) return error(405, 'method_not_allowed', `Use ${routes[path].join(' or ')}.`)

  const denied = authorize(request)
  if (denied) return denied

  try {
    if (path === '/api/v1/presets') {
      return json({ presets: PRESETS.map((p, i) => ({ id: i + 1, onBrand: true, ...describe(p) })) }, 200, { 'Cache-Control': 'private, max-age=3600' })
    }
    if (path === '/api/v1/palette') {
      return json({ colors: Object.keys(PAL).map((k) => ({ key: k, name: PAL_NAME[k], hex: PAL[k] })) }, 200, { 'Cache-Control': 'private, max-age=3600' })
    }
    if (path === '/api/v1/combinations' || path === '/api/v1/preset-colors') {
      const trios = PRESET_TRIOS.map((c) => ({ ...c, names: c.colors.map(colorName) }))
      return json({
        note: 'These are the color trios of the 24 presets, offered as starting points. They are not a rule: any combination of brand palette colors is on brand, and you are encouraged to make your own. Responses report "presetMatch" when a gradient happens to use a preset trio.',
        trios,
        combinations: trios, // previous name, kept for existing clients
      }, 200, { 'Cache-Control': 'private, max-age=3600' })
    }
    if (path === '/api/v1/batch') return await batchRoute(request, url)
    if (path === '/api/v1/collage') return await collageRoute(request, url)
    return await gradientRoute(request, url)
  } catch (e) {
    if (e instanceof InputError) return error(400, 'invalid_request', e.message)
    if (e instanceof HttpError) return error(e.status, e.code, e.message)
    console.error(e)
    return error(500, 'internal_error', 'Something went wrong while generating the gradient.')
  }
}
