// Gradient model shared by the API: palette, formats, presets and parameter normalisation.
// Mirrors the definitions in index.html so API output matches the generator UI.

export const PAL = {
  black: '#131619', ink: '#071b22', red: '#f84747', orange: '#ff7542', peach: '#ffbc8a', gold: '#fdcb65',
  lime: '#bbee3c', green: '#3fb66b', turquoise: '#10ddc4', sky: '#01d4e5', teal: '#0a77a2', cobalt: '#065eff',
  purple: '#4e49ff', lilac: '#c1b5ff', plum: '#612d68', pink: '#ff3d9c', mist: '#f3f4f4', white: '#ffffff',
}
export const PAL_NAME = {
  black: 'Blue black', ink: 'Night', red: 'Red', orange: 'Orange', peach: 'Peach', gold: 'Gold', lime: 'Lime',
  green: 'Green', turquoise: 'Turquoise', sky: 'Sky', teal: 'Deep teal', cobalt: 'Cobalt', purple: 'Purple',
  lilac: 'Lilac', plum: 'Plum', pink: 'Pink', mist: 'Mist', white: 'White',
}

export const FORMATS = {
  square: { w: 1080, h: 1080, label: 'Square' },
  portrait: { w: 1080, h: 1350, label: '4:5' },
  wide: { w: 1920, h: 1080, label: '16:9' },
  story: { w: 1080, h: 1920, label: '9:16' },
  og: { w: 1200, h: 630, label: 'Social card' },
  card: { w: 424, h: 410, label: 'UI card' },
}

export const MODES = ['linear', 'radial', 'mesh', 'flow', 'wave']

const BASE = {
  mode: 'linear', colors: [PAL.black, PAL.cobalt, PAL.lilac], stops: [0, 0.5, 1], angle: 0, center: [0.5, 0.5],
  sizeX: 0.5, sizeY: 0.42, amp: 0.1, freq: 1, warp: 0.07, warpScale: 1.6, grain: 0.06, motion: 0.6, loop: 8, seed: 3,
  points: [[0.2, 0.2], [0.8, 0.7]], radii: [0.4, 0.4],
}
const clone = (o) => JSON.parse(JSON.stringify(o))
const P = PAL

export const PRESETS = [
  { mode: 'linear', colors: [P.lilac, P.cobalt, P.turquoise], stops: [0.1, 0.5, 0.92] },
  { mode: 'radial', colors: [P.lime, P.green, P.turquoise], stops: [0.28, 0.6, 0.98], center: [0.95, 0.02], sizeX: 1.15, sizeY: 1.15 },
  { mode: 'flow', colors: [P.purple, P.peach, P.purple], stops: [0.26, 0.5, 0.74], angle: -45, amp: 0.14, freq: 1.1 },
  { mode: 'linear', colors: [P.ink, P.red, P.orange], stops: [0.04, 0.3, 0.6] },
  { mode: 'mesh', colors: [P.ink, P.lilac, P.purple], points: [[0.08, 0.05], [0.3, 0.45]], radii: [0.3, 0.42] },
  { mode: 'radial', colors: [P.lime, P.teal, P.peach], stops: [0.5, 0.86, 1.3] },
  { mode: 'mesh', colors: [P.ink, P.red, P.cobalt], points: [[0.02, 0.95], [0.98, 0.02]], radii: [0.55, 0.55] },
  { mode: 'mesh', colors: [P.teal, P.sky, P.orange], points: [[0.9, 0.12], [1.02, 1.02]], radii: [0.36, 0.34] },
  { mode: 'mesh', colors: [P.pink, P.plum, P.peach], points: [[0.15, 0.1], [1, 1]], radii: [0.45, 0.42] },
  { mode: 'radial', colors: [P.gold, P.pink, P.purple], stops: [0.55, 0.88, 1.15] },
  { mode: 'linear', colors: [P.plum, P.lime, P.teal], stops: [0.02, 0.47, 0.86] },
  { mode: 'flow', colors: [P.pink, P.turquoise, P.black], stops: [0.22, 0.48, 0.86], angle: -55, amp: 0.12, freq: 1 },
  { mode: 'radial', colors: [P.sky, P.cobalt, P.red], stops: [0.45, 0.82, 1.22] },
  { mode: 'linear', colors: [P.ink, P.turquoise, P.gold], stops: [0.06, 0.38, 0.76] },
  { mode: 'radial', colors: [P.orange, P.plum, P.lilac], stops: [0.58, 0.86, 1.12] },
  { mode: 'linear', colors: [P.peach, P.purple, P.ink], stops: [0.46, 0.7, 0.95] },
  { mode: 'linear', colors: [P.black, P.lilac, P.lilac], stops: [0.4, 0.58, 1], angle: 60 },
  { mode: 'radial', colors: [P.pink, P.plum, P.turquoise], stops: [0.56, 0.86, 1.12] },
  { mode: 'linear', colors: [P.cobalt, P.lilac, P.red], stops: [0.04, 0.34, 0.56] },
  { mode: 'radial', colors: [P.peach, P.red, P.ink], stops: [0.42, 0.8, 1.18] },
  { mode: 'flow', colors: [P.green, P.gold, P.teal], stops: [0.3, 0.51, 0.8], angle: 45, amp: 0.16, freq: 1 },
  { mode: 'linear', colors: [P.turquoise, P.purple, P.lime], stops: [0.1, 0.5, 0.92], angle: 45 },
  { mode: 'wave', colors: [P.orange, P.pink, P.orange], stops: [0.16, 0.5, 0.84], amp: 0.06, freq: 6, warp: 0.02 },
  { mode: 'mesh', colors: [P.ink, P.gold, P.peach], points: [[0.85, 0.1], [1, 1]], radii: [0.45, 0.3], grain: 0.1 },
].map((p, i) => Object.assign(clone(BASE), p, { seed: 3 + i * 1.7 }))

export const TRANSPARENT = 'transparent'

/* ---------- Brand colors and preset trios ----------
 * A gradient is on brand when every color comes from the brand palette, in any combination.
 * The color trios of the 24 brand-guideline presets are suggestions to start from, not rules.
 */
const trioKey = (cols) => cols.slice().sort().join(',')
export const PRESET_TRIOS = (() => {
  const seen = new Map()
  PRESETS.forEach((p, i) => {
    const key = trioKey(p.colors)
    if (!seen.has(key)) seen.set(key, { id: seen.size + 1, colors: p.colors.slice(), presets: [] })
    seen.get(key).presets.push(i + 1)
  })
  return [...seen.values()]
})()
const PALETTE_HEX = new Set(Object.values(PAL))

/** True when every color is a brand palette color (transparent is allowed anywhere). */
export function isOnBrand(colors) {
  return colors.every((c) => c === TRANSPARENT || PALETTE_HEX.has(c))
}
/** Colors that are not in the brand palette. */
export const offPalette = (colors) => colors.filter((c) => c !== TRANSPARENT && !PALETTE_HEX.has(c))

/** Preset numbers whose color trio these colors use (any order; transparent may stand in for any color). Informational only. */
export function presetMatches(colors) {
  const opaque = colors.filter((c) => c !== TRANSPARENT)
  return PRESET_TRIOS.filter((a) => {
    if (opaque.length === 3) return trioKey(opaque) === trioKey(a.colors)
    const pool = a.colors.slice()
    return opaque.every((c) => { const i = pool.indexOf(c); if (i < 0) return false; pool.splice(i, 1); return true })
  }).flatMap((a) => a.presets)
}

export const colorName = (hex) => {
  if (hex === TRANSPARENT) return 'Transparent'
  const k = Object.keys(PAL).find((k) => PAL[k] === hex.toLowerCase())
  return k ? PAL_NAME[k] : 'Custom'
}

/* ---------- Seeded "shuffle" (same distribution as the UI's Shuffle button) ---------- */
export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function randomGradient(seedKey, { presetColors = false } = {}) {
  return randomGradientFrom(mulberry32(hashString(String(seedKey))), { presetColors })
}
/** Random gradient drawn from the generator `R` (same draw order as the UI's makeRandomGradient). */
export function randomGradientFrom(R, { presetColors = false } = {}) {
  const rnd = (a, b) => a + R() * (b - a)
  const pick = (a) => a[Math.floor(R() * a.length)]
  const mode = pick(['linear', 'linear', 'radial', 'radial', 'mesh', 'mesh', 'flow', 'wave'])
  const keys = Object.keys(PAL).filter((k) => k !== 'white' && k !== 'mist')
  const cols = []
  while (cols.length < 3) { const c = PAL[pick(keys)]; if (!cols.includes(c)) cols.push(c) }
  if (mode === 'mesh' && R() < 0.6) cols[0] = pick([PAL.ink, PAL.black, PAL.plum, PAL.teal, PAL.cobalt, PAL.purple])
  // Random colors are always palette colors. presetColors keeps the random layout but uses a preset's trio.
  if (presetColors) cols.splice(0, 3, ...pick(PRESET_TRIOS).colors)
  const span = mode === 'radial' ? 1.25 : 1
  const stops = [rnd(-0.05, 0.2), 0, rnd(0.75, 1) * span]
  stops[1] = stops[0] + (stops[2] - stops[0]) * rnd(0.3, 0.7)
  return Object.assign(clone(BASE), {
    mode, colors: cols, stops, angle: pick([0, 0, 0, 45, -45, 60, -60, 90, 180, rnd(-180, 180)]),
    center: [rnd(0.2, 0.8), rnd(0.2, 0.8)], sizeX: rnd(0.4, 0.8), sizeY: rnd(0.35, 0.7),
    amp: mode === 'wave' ? rnd(0.03, 0.08) : rnd(0.06, 0.2), freq: mode === 'wave' ? Math.round(rnd(3, 9)) : rnd(0.6, 1.6),
    warp: rnd(0.03, 0.14), warpScale: rnd(1, 2.6), grain: rnd(0.04, 0.1), motion: rnd(0.4, 1),
    points: [[rnd(-0.05, 1.05), rnd(-0.05, 1.05)], [rnd(-0.05, 1.05), rnd(-0.05, 1.05)]], radii: [rnd(0.3, 0.6), rnd(0.25, 0.55)],
    seed: rnd(0, 100),
  })
}

/* ---------- Input parsing ---------- */
export class InputError extends Error {}

export const NUM_FIELDS = {
  angle: [-360, 360], sizeX: [0.05, 4], sizeY: [0.05, 4], amp: [0, 1], freq: [0.05, 50], warp: [0, 1],
  warpScale: [0.05, 10], grain: [0, 0.5], motion: [0, 3], loop: [1, 60], seed: [-1e6, 1e6],
}

function toNum(v, name) {
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) throw new InputError(`"${name}" must be a number`)
  return n
}
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v))
/** Parse a number and clamp it to `range`; throws InputError when it isn't a number. */
export const readNumber = (v, name, range) => clamp(toNum(v, name), range)

function toList(v, name) {
  if (Array.isArray(v)) return v.flat()
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  throw new InputError(`"${name}" must be a list`)
}
function numList(v, name, len, range) {
  const arr = toList(v, name)
  if (arr.length !== len) throw new InputError(`"${name}" needs exactly ${len} numbers`)
  return arr.map((x) => clamp(toNum(x, name), range))
}

export function parseColor(v) {
  const s = String(v).trim().toLowerCase()
  if (s === TRANSPARENT || s === 'none') return TRANSPARENT
  if (PAL[s]) return PAL[s]
  const byName = Object.keys(PAL_NAME).find((k) => PAL_NAME[k].toLowerCase() === s)
  if (byName) return PAL[byName]
  const m = s.replace(/^#/, '')
  if (/^[0-9a-f]{6}$/.test(m)) return '#' + m
  if (/^[0-9a-f]{3}$/.test(m)) return '#' + [...m].map((c) => c + c).join('')
  throw new InputError(`Unknown color "${v}". Use #rrggbb, "transparent" or a palette name (${Object.keys(PAL).join(', ')})`)
}

/** Apply user-supplied overrides onto a base gradient, validating and clamping each field. */
export function applyOverrides(base, input) {
  const g = clone(base)
  if (input.mode != null) {
    const m = String(input.mode).toLowerCase()
    if (!MODES.includes(m)) throw new InputError(`"mode" must be one of ${MODES.join(', ')}`)
    g.mode = m
  }
  if (input.colors != null) {
    const c = toList(input.colors, 'colors')
    if (c.length !== 3) throw new InputError('"colors" needs exactly 3 colors')
    g.colors = c.map(parseColor)
    if (g.colors.every((x) => x === TRANSPARENT)) throw new InputError('At least one color must not be transparent')
  }
  if (input.stops != null) g.stops = numList(input.stops, 'stops', 3, [-1, 3])
  if (input.center != null) g.center = numList(input.center, 'center', 2, [-1, 2])
  if (input.radii != null) g.radii = numList(input.radii, 'radii', 2, [0.02, 3])
  if (input.points != null) {
    const p = numList(input.points, 'points', 4, [-1, 2])
    g.points = [[p[0], p[1]], [p[2], p[3]]]
  }
  for (const [k, range] of Object.entries(NUM_FIELDS)) {
    if (input[k] != null && input[k] !== '') g[k] = clamp(toNum(input[k], k), range)
  }
  return g
}

/** Public shape of a gradient (what the UI's JSON export calls `gradient`). */
export function describe(g) {
  return {
    mode: g.mode, colors: g.colors, colorNames: g.colors.map(colorName), stops: g.stops, angle: g.angle,
    center: g.center, sizeX: g.sizeX, sizeY: g.sizeY, amp: g.amp, freq: g.freq, warp: g.warp,
    warpScale: g.warpScale, grain: g.grain, motion: g.motion, loop: g.loop, seed: g.seed,
    points: g.points, radii: g.radii,
  }
}
