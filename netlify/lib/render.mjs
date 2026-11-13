// CPU port of the generator's WebGL fragment shader, so gradients can be rendered on the server.
// The math follows index.html's Renderer.FS line by line (OKLab color ramps, fbm warp, grain).
// Extras beyond the browser renderer: transparent color stops, grayscale masks, seamless tiling
// and tone analysis for picking a text color.

const TAU = Math.PI * 2
const MODE_ID = { linear: 0, radial: 1, mesh: 2, flow: 3, wave: 4 }
export const TRANSPARENT = 'transparent'
const fract = (x) => x - Math.floor(x)
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

function h12(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d; b += d; c += d
  return fract((a + b) * c)
}
function h22(x, y, out) {
  let a = fract(x * 0.1031), b = fract(y * 0.103), c = fract(x * 0.0973)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d; b += d; c += d
  out[0] = fract((a + b) * c)
  out[1] = fract((a + c) * b)
}
function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = h12(ix, iy), b = h12(ix + 1, iy), c = h12(ix, iy + 1), d = h12(ix + 1, iy + 1)
  const top = a + (b - a) * ux, bot = c + (d - c) * ux
  return top + (bot - top) * uy
}
function fbm(x, y) {
  let v = 0, amp = 0.5
  for (let i = 0; i < 4; i++) {
    v += amp * vn(x, y)
    const nx = 1.6 * x - 1.2 * y + 3.1, ny = 1.2 * x + 1.6 * y + 1.7
    x = nx; y = ny; amp *= 0.5
  }
  return v
}

/** sRGB hex -> OKLab, identical to Renderer.ok in index.html */
export function hexToOk(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const l2s = (c) => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055 }

// OKLab lightness that maps to sRGB 50% gray, used for the mask's middle stop.
const MASK_MID_L = Math.cbrt(Math.pow((0.5 + 0.055) / 1.055, 2.4))

/** Colors (OKLab) and alpha per stop. Transparent stops borrow a neighbour's color to avoid gray fringes. */
function stopsFor(s, mask) {
  if (mask) {
    const C = s.mode === 'mesh' ? [[0, 0, 0], [1, 0, 0], [1, 0, 0]] : [[0, 0, 0], [MASK_MID_L, 0, 0], [1, 0, 0]]
    return { C, A: [1, 1, 1] }
  }
  const opaque = s.colors.map((c) => c !== TRANSPARENT)
  if (!opaque.some(Boolean)) throw new Error('At least one color must be opaque')
  const C = s.colors.map((c, i) => {
    if (opaque[i]) return hexToOk(c)
    const order = s.mode === 'mesh' && i > 0 ? [0, 1, 2] : [i + 1, i - 1, i + 2, i - 2]
    const j = order.find((k) => k >= 0 && k < 3 && opaque[k])
    return hexToOk(s.colors[j])
  })
  return { C, A: opaque.map((o) => (o ? 1 : 0)) }
}

/**
 * Render gradient `s` at loop phase `t` (radians).
 * opts.channels: 1 (mask), 3 (RGB) or 4 (RGBA). opts.mask renders a grayscale mask.
 * opts.outW/outH render beyond the W×H frame (used for tiling); opts.wrap makes grain repeat every W×H.
 * Returns a byte buffer, top row first.
 */
export function render(s, W, H, t = 0, opts = {}) {
  const outW = opts.outW || W, outH = opts.outH || H
  const mask = !!opts.mask
  const channels = opts.channels || (mask ? 1 : 3)
  const mode = MODE_ID[s.mode] ?? 0
  const { C, A } = stopsFor(s, mask)
  const st = s.stops.slice()
  for (let i = 1; i < 3; i++) st[i] = Math.max(st[i], st[i - 1] + 0.002)
  const angle = (s.angle * Math.PI) / 180
  const cycles = Math.round(s.motion * 2)
  const seedX = (s.seed * 13.17) % 97, seedY = (s.seed * 7.31) % 89
  // Collage tiles pass the grain size of the whole canvas so every tile has the same grain.
  const grainPx = s.grainPx || Math.max(1, Math.min(W, H) / 540)
  const m = Math.min(W, H), ax = W / m, ay = H / m
  const orbX = Math.cos(t), orbY = Math.sin(t)
  const dirX = Math.sin(angle), dirY = Math.cos(angle)
  const ext = Math.abs(dirX) * ax + Math.abs(dirY) * ay
  const motion = s.motion, warp = s.warp, ws = s.warpScale, grain = s.grain
  const noiseAmt = mask ? 0 : grain * 0.35

  const ccX = (s.center[0] - 0.5) * ax + orbX * 0.04 * motion, ccY = (s.center[1] - 0.5) * ay + orbY * 0.04 * motion
  const br = 1 + 0.06 * motion * Math.sin(t)
  const rsX = s.sizeX * ax * br, rsY = s.sizeY * ay * br
  const p1x = (s.points[0][0] - 0.5) * ax + 0.07 * motion * Math.cos(t), p1y = (s.points[0][1] - 0.5) * ay + 0.07 * motion * Math.sin(t)
  const p2x = (s.points[1][0] - 0.5) * ax + 0.07 * motion * Math.cos(t + 2.1), p2y = (s.points[1][1] - 0.5) * ay + 0.07 * motion * Math.sin(1 - t)
  const r1 = Math.max(s.radii[0], 0.01), r2 = Math.max(s.radii[1], 0.01)
  const linShift = Math.sin(t) * 0.04 * motion

  const out = Buffer.allocUnsafe(outW * outH * channels)
  const g2 = [0, 0]
  const col = [0, 0, 0]
  let alpha = 1
  const ramp = (f) => {
    const a = smoothstep(st[0], st[1], f), b = smoothstep(st[1], st[2], f)
    for (let k = 0; k < 3; k++) {
      const c = C[0][k] + (C[1][k] - C[0][k]) * a
      col[k] = c + (C[2][k] - c) * b
    }
    const al = A[0] + (A[1] - A[0]) * a
    alpha = al + (A[2] - al) * b
  }

  let o = 0
  for (let row = 0; row < outH; row++) {
    const fcy = H - row - 0.5 // gl_FragCoord.y (origin bottom-left); continues past the frame for tiling
    const v0 = 1 - fcy / H
    const gy = opts.wrap ? H - (row % H) - 0.5 : fcy
    const gcy = Math.floor(gy / grainPx)
    for (let x = 0; x < outW; x++) {
      const fcx = x + 0.5
      const u0 = fcx / W
      const wpx = u0 * ax * ws + seedX + orbX * 0.35 * motion
      const wpy = v0 * ay * ws + seedY + orbY * 0.35 * motion
      const wx = fbm(wpx, wpy) - 0.5, wy = fbm(wpx + 5.2, wpy + 1.3) - 0.5
      let u = u0 + wx * warp * 2, v = v0 + wy * warp * 2
      const gcx = Math.floor((opts.wrap ? (x % W) + 0.5 : fcx) / grainPx)
      h22(gcx, gcy, g2)
      u += (g2[0] - 0.5) * grain; v += (g2[1] - 0.5) * grain
      const qx = (u - 0.5) * ax, qy = (v - 0.5) * ay

      if (mode === 0) {
        ramp((qx * dirX + qy * dirY) / ext + 0.5 + linShift)
      } else if (mode === 1) {
        const dx = (qx - ccX) / rsX, dy = (qy - ccY) / rsY
        ramp(Math.sqrt(dx * dx + dy * dy))
      } else if (mode === 2) {
        let d = Math.hypot(qx - p1x, qy - p1y) / r1
        const k1 = Math.exp(-d * d * 2)
        d = Math.hypot(qx - p2x, qy - p2y) / r2
        const k2 = Math.exp(-d * d * 2)
        for (let k = 0; k < 3; k++) {
          const c = C[0][k] + (C[1][k] - C[0][k]) * k1
          col[k] = c + (C[2][k] - c) * k2
        }
        const al = A[0] + (A[1] - A[0]) * k1
        alpha = al + (A[2] - al) * k2
      } else {
        const px = qx * dirY - qy * dirX
        const yy = (qx * dirX + qy * dirY) / ext + 0.5
        let wv
        if (mode === 3) wv = Math.sin(px * s.freq * Math.PI + t * cycles)
        else wv = (Math.abs(fract(px * s.freq + (t * cycles) / TAU) - 0.5) * 2 - 0.5) * 2
        ramp(yy + s.amp * wv)
      }

      const L = col[0], Aa = col[1], B = col[2]
      let l_ = L + 0.3963377774 * Aa + 0.2158037573 * B
      let m_ = L - 0.1055613458 * Aa - 0.0638541728 * B
      let s_ = L - 0.0894841775 * Aa - 1.291485548 * B
      l_ = l_ * l_ * l_; m_ = m_ * m_ * m_; s_ = s_ * s_ * s_
      const n = noiseAmt ? (h12(gcx + 71.3, gcy + 71.3) - 0.5) * noiseAmt : 0
      const R = l2s(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_) + n
      if (channels === 1) { out[o++] = Math.round(Math.min(1, Math.max(0, R)) * 255); continue }
      const G = l2s(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_) + n
      const Bc = l2s(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_) + n
      out[o++] = Math.round(Math.min(1, Math.max(0, R)) * 255)
      out[o++] = Math.round(Math.min(1, Math.max(0, G)) * 255)
      out[o++] = Math.round(Math.min(1, Math.max(0, Bc)) * 255)
      if (channels === 4) out[o++] = Math.round(alpha * 255)
    }
  }
  return out
}

/**
 * Seamless version of `render`: renders an overlap margin past the right and bottom edges and
 * cross-fades it into the left and top edges, so the image repeats without visible seams.
 */
export function renderTile(s, W, H, t = 0, opts = {}) {
  const ox = Math.max(1, Math.min(Math.floor(W / 2), Math.round(Math.min(W, H) * 0.3)))
  const oy = Math.max(1, Math.min(Math.floor(H / 2), Math.round(Math.min(W, H) * 0.3)))
  const EW = W + ox, EH = H + oy
  const ch = opts.channels || (opts.mask ? 1 : 3)
  const big = render(s, W, H, t, { ...opts, channels: ch, outW: EW, outH: EH, wrap: true })
  const out = Buffer.allocUnsafe(W * H * ch)
  const sm = (x) => x * x * (3 - 2 * x)
  for (let y = 0; y < H; y++) {
    const wy = y < oy ? sm(y / oy) : 1
    for (let x = 0; x < W; x++) {
      const wx = x < ox ? sm(x / ox) : 1
      const a = (y * EW + x) * ch, b = (y * EW + x + W) * ch
      const c = ((y + H) * EW + x) * ch, d = ((y + H) * EW + x + W) * ch
      const o = (y * W + x) * ch
      // Samples beyond the overlap margin don't exist, so only read the ones with a non-zero weight.
      for (let k = 0; k < ch; k++) {
        const top = wx === 1 ? big[a + k] : big[b + k] * (1 - wx) + big[a + k] * wx
        if (wy === 1) { out[o + k] = Math.round(top); continue }
        const bot = wx === 1 ? big[c + k] : big[d + k] * (1 - wx) + big[c + k] * wx
        out[o + k] = Math.round(bot * (1 - wy) + top * wy)
      }
    }
  }
  return out
}

/* ---------- Tone analysis (same contrast scoring as the generator UI) ---------- */
const LUT = new Float64Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) })
const L_DARK_TEXT = 0.2126 * LUT[0x13] + 0.7152 * LUT[0x16] + 0.0722 * LUT[0x19]
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d

function summarize(lums) {
  if (!lums.length) return null
  const sorted = Float64Array.from(lums).sort()
  const avg = lums.reduce((a, b) => a + b, 0) / lums.length
  // 10th-percentile contrast: 90% of the area is at least this readable.
  const pLight = ratio(1, sorted[Math.floor(0.9 * (sorted.length - 1))])
  const pDark = ratio(sorted[Math.floor(0.1 * (sorted.length - 1))], L_DARK_TEXT)
  const light = pLight >= pDark
  return {
    tone: light ? 'dark' : 'light',
    textColor: light ? '#ffffff' : '#131619',
    luminance: round(avg),
    contrast: { white: round(pLight, 2), dark: round(pDark, 2) },
  }
}

/**
 * Tone of a gradient, overall and for a 3×3 grid of zones (row-major, top-left first).
 * `tone` describes the background: "dark" backgrounds take white text, "light" ones take #131619.
 */
export function analyzeTone(s, W, H, t = 0, opts = {}) {
  const k = Math.min(1, 160 / Math.max(W, H))
  const w = Math.max(9, Math.round(W * k)), h = Math.max(9, Math.round(H * k))
  const scaled = { ...s }
  const ch = opts.hasAlpha ? 4 : 3
  const px = (opts.tile ? renderTile : render)(scaled, w, h, t, { channels: ch })
  const all = [], zones = Array.from({ length: 9 }, () => [])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch
    if (ch === 4 && px[i + 3] < 128) continue // ignore mostly transparent pixels
    const L = 0.2126 * LUT[px[i]] + 0.7152 * LUT[px[i + 1]] + 0.0722 * LUT[px[i + 2]]
    all.push(L)
    zones[Math.min(2, Math.floor((y / h) * 3)) * 3 + Math.min(2, Math.floor((x / w) * 3))].push(L)
  }
  const overall = summarize(all)
  if (!overall) return null
  return {
    ...overall,
    zones: zones.map((z, i) => {
      const r = summarize(z)
      return r && { zone: ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'][i], tone: r.tone, textColor: r.textColor, luminance: r.luminance }
    }).filter(Boolean),
  }
}
