// Collage model shared by the API: seeded tile layout, tile shapes and the gradients that fill them.
// Mirrors the "Collage" section of index.html, so the same seeds give the same layout as the generator.

import { PRESETS, mulberry32, randomGradientFrom } from './gradients.mjs'

const TAU = Math.PI * 2
const clone = (o) => JSON.parse(JSON.stringify(o))

export const COLLAGE_DEFAULTS = {
  count: 8, tileSize: 0.46, smallShare: 0.5, smallScale: 0.55, variance: 0.22, edges: 0.3,
  source: 'mix', background: 'white', layoutSeed: 7, gradientSeed: 11,
}
export const COLLAGE_RANGES = {
  count: [1, 20], tileSize: [0.1, 0.6], smallShare: [0, 0.75], smallScale: [0.3, 0.85], variance: [0, 0.4], edges: [0, 1],
}
export const COLLAGE_SOURCES = ['mix', 'presets', 'random']
export const COLLAGE_BACKGROUNDS = ['white', 'transparent']
// The collage tiles take their texture from these settings (the generator uses the current gradient's).
export const TEXTURE_DEFAULTS = { grain: 0.06, motion: 0.6, warp: 0.07, warpScale: 1.6, loop: 8 }

/** 24 gradients for the tiles, drawn from brand presets, random gradients or a mix. */
export function genGradients(c, { presetColors = false } = {}) {
  const R = mulberry32(c.gradientSeed), out = []
  let bag = []
  for (let i = 0; i < 24; i++) {
    const usePreset = c.source === 'presets' || (c.source === 'mix' && R() < 0.6)
    if (usePreset) {
      if (!bag.length) bag = PRESETS.map((_, j) => j).sort(() => R() - 0.5)
      const g = clone(PRESETS[bag.pop()])
      g.seed = R() * 100
      if (g.mode === 'linear' || g.mode === 'flow' || g.mode === 'wave') { if (R() < 0.3) g.angle += 180; g.angle += (R() - 0.5) * 24 }
      if (g.mode === 'radial') g.center = [g.center[0] + (R() - 0.5) * 0.3, g.center[1] + (R() - 0.5) * 0.3]
      out.push(g)
    } else out.push(randomGradientFrom(R, { presetColors }))
  }
  return out
}

/** Tile positions as fractions of the canvas; sizes in units of its short edge. */
export function genLayout(c, W, H) {
  const u = Math.min(W, H)
  const R = mulberry32(c.layoutSeed), E = mulberry32(c.layoutSeed * 31 + 5)
  const placed = []
  const asps = [0.62, 0.74, 0.86, 1, 1.18, 1.4, 1.65]
  // Two tiers: large tiles are laid out first, then smaller tiles tuck in around and over them.
  const nSmall = Math.min(c.count - 1, Math.round(c.count * c.smallShare))
  for (let i = 0; i < c.count; i++) {
    const small = i >= c.count - nSmall
    let best = null, bs = Infinity
    for (let k = 0; k < 90; k++) {
      const asp = asps[Math.floor(R() * asps.length)]
      const s = c.tileSize * (small ? c.smallScale : 1) * (1 + (R() * 2 - 1) * c.variance) * u
      const w = s * Math.sqrt(asp), h = s / Math.sqrt(asp)
      const mx = 0.06 * W, my = 0.07 * H
      if (w > W - 2 * mx || h > H - 2 * my) continue
      const x = mx + w / 2 + R() * (W - 2 * mx - w), y = my + h / 2 + R() * (H - 2 * my - h)
      let maxOv = 0, near = Infinity
      for (const t of placed) {
        const ox = Math.max(0, Math.min(x + w / 2, t.x + t.w / 2) - Math.max(x - w / 2, t.x - t.w / 2))
        const oy = Math.max(0, Math.min(y + h / 2, t.y + t.h / 2) - Math.max(y - h / 2, t.y - t.h / 2))
        maxOv = Math.max(maxOv, (ox * oy) / Math.min(w * h, t.w * t.h))
        near = Math.min(near, Math.max(Math.abs(x - t.x) - (w + t.w) / 2, Math.abs(y - t.y) - (h + t.h) / 2))
      }
      if (maxOv > (small ? 0.62 : 0.5)) continue
      const dc = Math.hypot((x - W / 2) / W, (y - H / 2) / H)
      const score = (placed.length ? (Math.max(0, near) / u) * 5 + Math.abs(maxOv - (small ? 0.3 : 0.16)) * 1.6 : 0) + dc * (small ? 0.35 : 0.55) + R() * 0.3
      if (score < bs) { bs = score; best = { x, y, w, h, small } }
    }
    if (best) placed.push(best)
  }
  // Re-center the group so the cluster sits in the middle of the frame.
  if (placed.length) {
    const x0 = Math.min(...placed.map((t) => t.x - t.w / 2)), x1 = Math.max(...placed.map((t) => t.x + t.w / 2))
    const y0 = Math.min(...placed.map((t) => t.y - t.h / 2)), y1 = Math.max(...placed.map((t) => t.y + t.h / 2))
    const dx = W / 2 - (x0 + x1) / 2, dy = H / 2 - (y0 + y1) / 2
    placed.forEach((t) => { t.x += dx; t.y += dy })
  }
  // Stacking order: mostly random, with small tiles a little more likely to sit on top.
  placed.forEach((t) => { t.z = R() + (t.small ? 0.35 : 0) })
  placed.sort((a, b) => a.z - b.z)
  return placed.map((t) => ({
    cx: t.x / W, cy: t.y / H, w: t.w / u, h: t.h / u, small: t.small,
    edgeRoll: E(), sideRoll: E(), styleRoll: E(), amp: 0.015 + E() * 0.006, per: 0.036 + E() * 0.01, phase: E() * TAU, warpMul: 0.7 + E() * 0.6,
  }))
}

function tileEdges(t, edges) {
  if (t.edgeRoll >= edges) return null
  return { left: t.sideRoll > 0.45, right: t.sideRoll < 0.72, round: 0.28 }
}

/** Trace a tile's outline (rounded card, optionally toothed on the left and/or right) with canvas-style path calls. */
export function tilePath(ctx, x, y, w, h, t, u, edges) {
  const r = Math.min(0.022 * u, w / 4, h / 4), e = tileEdges(t, edges)
  // Teeth run the full height, so each corner on a toothed side is itself the first/last tooth tip
  // and gets the same tip radius as the teeth instead of the larger card radius.
  const amp = t.amp * u, n = Math.max(2, 2 * Math.round(h / (t.per * u))), half = h / n
  const rmax = ((Math.hypot(amp, half) * half) / (2 * amp)) * 0.98
  const tipR = e ? Math.min(r, rmax * e.round * 1.6) : r, innerR = e ? rmax * Math.min(0.35, e.round) : 0
  const teeth = (side) => {
    const list = []
    for (let k = 1; k < n; k++) {
      const yy = y + half * k, inner = k % 2 === 1
      const xx = side === 'right' ? (inner ? x + w - amp : x + w) : (inner ? x + amp : x)
      list.push([xx, yy, inner ? innerR : rmax * e.round])
    }
    return side === 'right' ? list : list.reverse()
  }
  const Rt = e && e.right, L = e && e.left
  const pts = [[x, y, L ? tipR : r], [x + w, y, Rt ? tipR : r]]
  if (Rt) pts.push(...teeth('right'))
  pts.push([x + w, y + h, Rt ? tipR : r], [x, y + h, L ? tipR : r])
  if (L) pts.push(...teeth('left'))
  const m = pts.length, last = pts[m - 1], first = pts[0]
  ctx.beginPath(); ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2)
  for (let i = 0; i < m; i++) { const p = pts[i], q = pts[(i + 1) % m]; ctx.arcTo(p[0], p[1], q[0], q[1], p[2]) }
  ctx.closePath()
}

/** Pixel box of a tile on a W×H canvas (rounded like the generator). */
export function tileBox(tl, W, H) {
  const u = Math.min(W, H)
  const w = Math.max(2, Math.round(tl.w * u)), h = Math.max(2, Math.round(tl.h * u))
  return { x: Math.round(tl.cx * W - w / 2), y: Math.round(tl.cy * H - h / 2), w, h }
}

/** The gradient a tile renders, with the collage-wide texture applied. */
export function tileState(tl, i, grads, texture, W, H) {
  const g = grads[i % grads.length]
  return {
    ...g, grain: texture.grain * 0.8, motion: texture.motion, warp: g.warp * tl.warpMul * (texture.warp / 0.07),
    warpScale: texture.warpScale, loop: texture.loop, grainPx: Math.max(1, Math.min(W, H) / 700),
  }
}

/** Records canvas path calls (moveTo/lineTo/arcTo) and turns them into SVG path data. */
export function svgPathRecorder() {
  const d = []
  let px = 0, py = 0
  const f = (v) => +(+v).toFixed(2)
  const rec = {
    d, beginPath() {}, closePath() { d.push('Z') },
    moveTo(x, y) { d.push(`M${f(x)} ${f(y)}`); px = x; py = y },
    lineTo(x, y) { d.push(`L${f(x)} ${f(y)}`); px = x; py = y },
    arcTo(x1, y1, x2, y2, r) {
      const v1x = px - x1, v1y = py - y1, v2x = x2 - x1, v2y = y2 - y1, l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y)
      if (r <= 0 || l1 < 1e-6 || l2 < 1e-6) { rec.lineTo(x1, y1); return }
      const ux = v1x / l1, uy = v1y / l1, wx = v2x / l2, wy = v2y / l2
      const th = Math.acos(Math.max(-1, Math.min(1, ux * wx + uy * wy)))
      if (th < 1e-4 || Math.PI - th < 1e-4) { rec.lineTo(x1, y1); return }
      const dd = r / Math.tan(th / 2), t1x = x1 + ux * dd, t1y = y1 + uy * dd, t2x = x1 + wx * dd, t2y = y1 + wy * dd
      const turn = -ux * wy - -uy * wx
      d.push(`L${f(t1x)} ${f(t1y)}`, `A${f(r)} ${f(r)} 0 0 ${turn > 0 ? 1 : 0} ${f(t2x)} ${f(t2y)}`); px = t2x; py = t2y
    },
  }
  return rec
}

/** SVG path data for a tile's outline, in canvas pixels. */
export function tilePathData(tl, W, H, edges, box = tileBox(tl, W, H)) {
  const rec = svgPathRecorder()
  tilePath(rec, box.x, box.y, box.w, box.h, tl, Math.min(W, H), edges)
  return rec.d.join(' ')
}
