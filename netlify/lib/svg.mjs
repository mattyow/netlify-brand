// Layered, animated SVG export, ported from the generator's "SVG layers" export in index.html.
// Each gradient (or collage tile) becomes its own named, clipped group. Motion is SMIL animation,
// so the file loops in browsers; design tools import the first frame and may drop grain and warp.

import sharp from 'sharp'
import { hexToOk } from './render.mjs'
import { tileBox, tilePathData, tileState } from './collage.mjs'

const TAU = Math.PI * 2

function okToHex(c) {
  const l_ = c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2], m_ = c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2], s_ = c[0] - 0.0894841775 * c[1] - 1.291485548 * c[2]
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + lin.map((v) => {
    v = Math.min(1, Math.max(0, v))
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }).join('')
}
const smooth = (a, b, x) => { if (b <= a) return x < a ? 0 : 1; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
// Same OKLab ramp as the renderer: three colors, smoothstepped between consecutive stops.
function rampFn(s) {
  const c3 = s.colors.map(hexToOk)
  const st = s.stops.slice(); for (let i = 1; i < 3; i++) st[i] = Math.max(st[i], st[i - 1] + 0.002)
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
  return (f) => { let c = c3[0]; c = mix(c, c3[1], smooth(st[0], st[1], f)); c = mix(c, c3[2], smooth(st[1], st[2], f)); return okToHex(c) }
}
const n2 = (v) => +(+v).toFixed(2), n4 = (v) => +(+v).toFixed(4)
function svgStops(fn, a, b, N) { let o = ''; for (let k = 0; k < N; k++) { const f = a + ((b - a) * k) / (N - 1); o += `<stop offset="${n4(k / (N - 1))}" stop-color="${fn(f)}"/>` } return o }
const KF = 24
const kf = (fn) => { const v = []; for (let k = 0; k <= KF; k++) v.push(fn((TAU * k) / KF)); return v.join(';') }
const smil = (attr, values, dur) => `<animate attributeName="${attr}" values="${values}" dur="${dur}s" repeatCount="indefinite"/>`

// A 1-pixel-tall displacement map (green = wave height) for flow and wave modes.
async function waveMapURL(mw, fill) {
  const px = Buffer.alloc(mw * 4)
  for (let i = 0; i < mw; i++) { px[i * 4] = 128; px[i * 4 + 1] = fill(i); px[i * 4 + 2] = 128; px[i * 4 + 3] = 255 }
  const png = await sharp(px, { raw: { width: mw, height: 1, channels: 4 } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function svgTile(id, x, y, w, h, s, phase, dur, pathD, grainPx, label) {
  const m = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, fn = rampFn(s), mo = s.motion, P = n2
  const pad = 0.35 * Math.max(w, h), X0 = x - pad, Y0 = y - pad, WW = w + 2 * pad, HH = h + 2 * pad
  const T = (t) => t + phase
  const full = `x="${P(X0)}" y="${P(Y0)}" width="${P(WW)}" height="${P(HH)}"`
  let defs = '', body = ''
  if (s.mode === 'linear') {
    const a = (s.angle * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), L = Math.abs(dx) * w + Math.abs(dy) * h
    const f0 = Math.min(-0.15, s.stops[0] - 0.15), f1 = Math.max(1.15, s.stops[2] + 0.15)
    defs += `<linearGradient id="${id}-fill" gradientUnits="userSpaceOnUse" x1="${P(cx + dx * (f0 - 0.5) * L)}" y1="${P(cy + dy * (f0 - 0.5) * L)}" x2="${P(cx + dx * (f1 - 0.5) * L)}" y2="${P(cy + dy * (f1 - 0.5) * L)}">${svgStops(fn, f0, f1, 32)}`
    if (mo > 0) defs += `<animateTransform attributeName="gradientTransform" type="translate" values="${kf((t) => { const d = -Math.sin(T(t)) * 0.04 * mo * L; return P(dx * d) + ' ' + P(dy * d) })}" dur="${dur}s" repeatCount="indefinite"/>`
    defs += '</linearGradient>'
    body = `<rect ${full} fill="url(#${id}-fill)"/>`
  } else if (s.mode === 'radial') {
    const rx = s.sizeX * w, ry = s.sizeY * h, c0x = cx + (s.center[0] - 0.5) * w, c0y = cy + (s.center[1] - 0.5) * h
    let fmax = 0
    ;[[X0, Y0], [X0 + WW, Y0], [X0, Y0 + HH], [X0 + WW, Y0 + HH]].forEach(([px, py]) => { fmax = Math.max(fmax, Math.hypot((px - c0x) / rx, (py - c0y) / ry)) })
    fmax = Math.max(fmax * 1.1, s.stops[2] + 0.2)
    const gx = (t) => n4((c0x + Math.cos(T(t)) * 0.04 * mo * m) / rx), gy = (t) => n4((c0y + Math.sin(T(t)) * 0.04 * mo * m) / ry), gr = (t) => n4(fmax * (1 + 0.06 * mo * Math.sin(T(t))))
    defs += `<radialGradient id="${id}-fill" gradientUnits="userSpaceOnUse" gradientTransform="scale(${P(rx)} ${P(ry)})" cx="${gx(0)}" cy="${gy(0)}" fx="${gx(0)}" fy="${gy(0)}" r="${gr(0)}">${svgStops(fn, 0, fmax, 40)}`
    if (mo > 0) defs += smil('cx', kf(gx), dur) + smil('cy', kf(gy), dur) + smil('fx', kf(gx), dur) + smil('fy', kf(gy), dur) + smil('r', kf(gr), dur)
    defs += '</radialGradient>'
    body = `<rect ${full} fill="url(#${id}-fill)"/>`
  } else if (s.mode === 'mesh') {
    body = `<rect ${full} fill="${s.colors[0]}"/>`
    const orbit = [(t) => [Math.cos(t), Math.sin(t)], (t) => [Math.cos(t + 2.1), Math.sin(1 - t)]]
    for (let j = 0; j < 2; j++) {
      if (!(s.radii[j] > 0)) continue
      const R = s.radii[j] * m, p0x = cx + (s.points[j][0] - 0.5) * w, p0y = cy + (s.points[j][1] - 0.5) * h
      const gx = (t) => P(p0x + 0.07 * mo * m * orbit[j](T(t))[0]), gy = (t) => P(p0y + 0.07 * mo * m * orbit[j](T(t))[1])
      let st = ''
      for (let k = 0; k <= 16; k++) { const d = (2 * k) / 16; st += `<stop offset="${n4(k / 16)}" stop-color="${s.colors[j + 1]}" stop-opacity="${n4(Math.exp(-2 * d * d))}"/>` }
      defs += `<radialGradient id="${id}-glow${j + 1}" gradientUnits="userSpaceOnUse" cx="${gx(0)}" cy="${gy(0)}" r="${P(2 * R)}">${st}`
      if (mo > 0) defs += smil('cx', kf(gx), dur) + smil('cy', kf(gy), dur) + smil('fx', kf(gx), dur) + smil('fy', kf(gy), dur)
      defs += '</radialGradient>'
      body += `<rect ${full} fill="url(#${id}-glow${j + 1})"/>`
    }
  } else {
    // Flow and wave: a ramp in a rotated frame, displaced by a wave map that scrolls one or more periods per loop.
    const a = (s.angle * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), L = Math.abs(dx) * w + Math.abs(dy) * h
    const D = Math.hypot(w, h) / 2 + pad
    const f0 = Math.min(-0.15, s.stops[0] - 0.15 - s.amp), f1 = Math.max(1.15, s.stops[2] + 0.15 + s.amp)
    defs += `<linearGradient id="${id}-fill" gradientUnits="userSpaceOnUse" x1="0" y1="${P((f0 - 0.5) * L)}" x2="0" y2="${P((f1 - 0.5) * L)}">${svgStops(fn, f0, f1, 32)}</linearGradient>`
    const cyc = Math.round(mo * 2), wave = s.mode === 'wave', period = wave ? m / s.freq : (2 * m) / s.freq
    const mapW = 2 * D + period * (cyc + 1), res = Math.min(1, 4096 / mapW), mw = Math.max(2, Math.round(mapW * res))
    const href = await waveMapURL(mw, (i) => {
      const xm = (-D + i / res) / m
      const wv = wave ? (Math.abs(((((xm * s.freq) % 1) + 1) % 1) - 0.5) * 2 - 0.5) * 2 : Math.sin(xm * s.freq * Math.PI)
      return Math.round(255 * (0.5 + 0.5 * wv))
    })
    defs += `<filter id="${id}-wave" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${P(-D)}" y="${P(-D)}" width="${P(2 * D)}" height="${P(2 * D)}" color-interpolation-filters="sRGB">`
      + `<feImage xlink:href="${href}" x="${P(-D)}" y="${P(-D)}" width="${P(mapW)}" height="${P(2 * D)}" preserveAspectRatio="none" result="map">`
      + (cyc > 0 ? `<animate attributeName="x" values="${P(-D)};${P(-D - cyc * period)}" dur="${dur}s" begin="-${n4(((((phase % TAU) + TAU) % TAU) / TAU) * dur)}s" repeatCount="indefinite"/>` : '') + '</feImage>'
      + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${P(2 * s.amp * L)}" xChannelSelector="R" yChannelSelector="G"/></filter>`
    body = `<g transform="translate(${P(cx)} ${P(cy)}) rotate(${P(-s.angle)})"><rect x="${P(-D)}" y="${P(-D)}" width="${P(2 * D)}" height="${P(2 * D)}" fill="url(#${id}-fill)" filter="url(#${id}-wave)"/></g>`
  }
  // Warp (slow noise, orbiting so the loop is seamless) and grain (fine static scatter).
  const orbitR = Math.min(0.8 * pad, ((0.35 * mo) / Math.max(0.05, s.warpScale)) * m)
  const seed = Math.floor(Math.abs(s.seed) * 7) % 997
  defs += `<filter id="${id}-texture" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" ${full} color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${(s.warpScale / m).toFixed(5)}" numOctaves="4" seed="${seed}" result="noise"/>`
    + '<feOffset in="noise" result="drift">' + (mo > 0 ? smil('dx', kf((t) => P(Math.cos(T(t)) * orbitR)), dur) + smil('dy', kf((t) => P(Math.sin(T(t)) * orbitR)), dur) : '') + '</feOffset>'
    + `<feDisplacementMap in="SourceGraphic" in2="drift" scale="${P(s.warp * (w + h) * 1.05)}" xChannelSelector="R" yChannelSelector="G" result="warped"/>`
    + `<feTurbulence type="fractalNoise" baseFrequency="${(0.5 / grainPx).toFixed(4)}" numOctaves="1" seed="${(seed + 17) % 997}" result="grainNoise"/>`
    + `<feDisplacementMap in="warped" in2="grainNoise" scale="${P(((s.grain * (w + h)) / 2) * 2.6)}" xChannelSelector="R" yChannelSelector="G"/></filter>`
  defs += `<clipPath id="${id}-shape"><path d="${pathD}"/></clipPath>`
  const layer = `<g id="${id}" data-name="${label}" clip-path="url(#${id}-shape)"><g filter="url(#${id}-texture)">${body}</g></g>`
  return { defs, layer }
}

const wrapSVG = (W, H, title, defs, layers) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${title}</title>
<defs>${defs}</defs>
${layers}
</svg>`

/** One gradient as a single clipped layer. `t` (0-1) shifts where the animation starts. */
export async function gradientSVG(g, W, H, t = 0) {
  const r = await svgTile('gradient', 0, 0, W, H, g, t * TAU, g.loop, `M0 0H${W}V${H}H0Z`, Math.max(1, Math.min(W, H) / 540), 'Gradient')
  return wrapSVG(W, H, 'Netlify gradient', r.defs, r.layer)
}

/** A collage: optional white background, then one clipped layer per tile in stacking order. */
export async function collageSVG(c, W, H, t = 0) {
  let defs = '', layers = ''
  if (c.background === 'white') layers += `<rect id="background" data-name="Background" width="${W}" height="${H}" fill="#ffffff"/>`
  for (let i = 0; i < c.tiles.length; i++) {
    const tl = c.tiles[i], box = tileBox(tl, W, H), n = String(i + 1).padStart(2, '0')
    const r = await svgTile(`tile-${n}`, box.x, box.y, box.w, box.h, tileState(tl, i, c.grads, c.texture, W, H), tl.phase + t * TAU, c.texture.loop,
      tilePathData(tl, W, H, c.edges, box), Math.max(1, Math.min(W, H) / 700), `Tile ${n}`)
    defs += r.defs; layers += r.layer
  }
  return wrapSVG(W, H, 'Netlify gradient collage', defs, layers)
}
