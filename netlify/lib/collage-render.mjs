// Raster collage: renders every tile with the CPU gradient renderer, clips it to its outline and
// stacks the tiles on a white or transparent canvas (same order and shapes as the generator).

import sharp from 'sharp'
import { render } from './render.mjs'
import { tileBox, tilePathData, tileState } from './collage.mjs'

const TAU = Math.PI * 2

// Anti-aliased coverage mask of a tile's outline, rasterised by sharp from an SVG path.
async function tileMask(d, box) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><path d="${d}" fill="#fff"/></svg>`
  return sharp(Buffer.from(svg)).extractChannel(3).raw().toBuffer()
}

/**
 * Render collage `c` (resolved: tiles, grads, texture, edges, background) at loop position `t` (0-1).
 * Returns { data, channels }: RGB on white, RGBA when the background is transparent.
 */
export async function renderCollage(c, W, H, t = 0, { opaque = false } = {}) {
  const alpha = c.background === 'transparent' && !opaque
  const ch = alpha ? 4 : 3
  const out = Buffer.alloc(W * H * ch, alpha ? 0 : 255)
  for (let i = 0; i < c.tiles.length; i++) {
    const tl = c.tiles[i], box = tileBox(tl, W, H)
    const px = render(tileState(tl, i, c.grads, c.texture, W, H), box.w, box.h, t * TAU + tl.phase, { channels: 3 })
    const mask = await tileMask(tilePathData(tl, W, H, c.edges, box), box)
    for (let y = 0; y < box.h; y++) {
      const Y = box.y + y
      if (Y < 0 || Y >= H) continue
      for (let x = 0; x < box.w; x++) {
        const X = box.x + x
        if (X < 0 || X >= W) continue
        const a = mask[y * box.w + x] / 255
        if (!a) continue
        const s = (y * box.w + x) * 3, o = (Y * W + X) * ch
        if (!alpha) {
          for (let k = 0; k < 3; k++) out[o + k] = Math.round(px[s + k] * a + out[o + k] * (1 - a))
          continue
        }
        const da = out[o + 3] / 255, oa = a + da * (1 - a)
        for (let k = 0; k < 3; k++) out[o + k] = Math.round((px[s + k] * a + out[o + k] * da * (1 - a)) / oa)
        out[o + 3] = Math.round(oa * 255)
      }
    }
  }
  return { data: out, channels: ch }
}
