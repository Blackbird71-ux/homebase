// src/lib/scanner/image-processing.ts
// Client-safe pure image math for the document scanner. Operates on canvases /
// ImageData the caller provides — no DOM-library or server imports, so it is safe
// to import from a client component. Used by DocumentScanner.tsx to deskew a
// photographed page (perspective warp from 4 dragged corners) and apply a
// "scanned" look (grayscale / adaptive black-and-white).

export type Corner = { x: number; y: number }
export type ScanMode = 'color' | 'gray' | 'bw'

// Largest output edge (px). Keeps the warp fast and the JPEG small while staying
// crisp enough for an A4 page (~150dpi).
const MAX_OUTPUT_EDGE = 1800

function dist(a: Corner, b: Corner): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Solve an 8×8 linear system (Gaussian elimination, partial pivoting). Returns
// the solution vector, or null if the system is singular.
function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8
  for (let col = 0; col < n; col++) {
    // Pivot
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    }
    if (Math.abs(A[pivot][col]) < 1e-10) return null
    if (pivot !== col) {
      ;[A[col], A[pivot]] = [A[pivot], A[col]]
      ;[b[col], b[pivot]] = [b[pivot], b[col]]
    }
    // Eliminate
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = A[r][col] / A[col][col]
      if (factor === 0) continue
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c]
      b[r] -= factor * b[col]
    }
  }
  const x = new Array<number>(n)
  for (let i = 0; i < n; i++) x[i] = b[i] / A[i][i]
  return x
}

// Homography [a,b,c,d,e,f,g,h] (h22 = 1) mapping each `from[i]` to `to[i]`.
// Maps via: u = (a·x+b·y+c)/(g·x+h·y+1), v = (d·x+e·y+f)/(g·x+h·y+1).
export function getPerspectiveTransform(from: Corner[], to: Corner[]): number[] | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v])
    b.push(v)
  }
  return solve8(A, b)
}

/**
 * Warp the quadrilateral `corners` (in source-pixel coords, order TL, TR, BR, BL)
 * into a rectangular output canvas, correcting perspective. Output dimensions are
 * derived from the quad's edge lengths and capped at MAX_OUTPUT_EDGE.
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  corners: [Corner, Corner, Corner, Corner],
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners
  let outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  let outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)))
  outW = Math.max(1, outW)
  outH = Math.max(1, outH)
  // Cap longest edge
  const longest = Math.max(outW, outH)
  if (longest > MAX_OUTPUT_EDGE) {
    const k = MAX_OUTPUT_EDGE / longest
    outW = Math.max(1, Math.round(outW * k))
    outH = Math.max(1, Math.round(outH * k))
  }

  const dst: Corner[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]
  // We inverse-map: for each output pixel, find the source pixel. So compute the
  // transform output → source.
  const H = getPerspectiveTransform(dst, corners)

  const srcCtx = source.getContext('2d')!
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height)
  const sw = source.width
  const sh = source.height
  const sd = srcData.data

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const outCtx = out.getContext('2d')!
  const outImg = outCtx.createImageData(outW, outH)
  const od = outImg.data

  if (!H) {
    // Degenerate quad — fall back to a plain copy so the user still gets a page.
    outCtx.drawImage(source, 0, 0, sw, sh, 0, 0, outW, outH)
    return out
  }

  const [a, b, c, d, e, f, g, h] = H
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = g * x + h * y + 1
      const sx = (a * x + b * y + c) / denom
      const sy = (d * x + e * y + f) / denom
      const oi = (y * outW + x) * 4
      // Bilinear sample
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        od[oi] = 255; od[oi + 1] = 255; od[oi + 2] = 255; od[oi + 3] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let ch = 0; ch < 3; ch++) {
        const top = sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx
        const bot = sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx
        od[oi + ch] = top * (1 - fy) + bot * fy
      }
      od[oi + 3] = 255
    }
  }
  outCtx.putImageData(outImg, 0, 0)
  return out
}

/**
 * Apply a "scanned" look to a canvas in place-style (returns the same canvas).
 *  - 'color': unchanged (returns input).
 *  - 'gray':  luminance grayscale.
 *  - 'bw':    Bradley adaptive threshold (integral image) — clean black text on
 *             white, robust to uneven lighting.
 */
export function applyScanFilter(canvas: HTMLCanvasElement, mode: ScanMode): HTMLCanvasElement {
  if (mode === 'color') return canvas
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const n = w * h

  // Grayscale pass (Rec. 601 luma)
  const gray = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    gray[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]
  }

  if (mode === 'gray') {
    for (let i = 0; i < n; i++) {
      const o = i * 4
      const v = gray[i]
      d[o] = v; d[o + 1] = v; d[o + 2] = v
    }
    ctx.putImageData(img, 0, 0)
    return canvas
  }

  // Bradley adaptive threshold via integral image.
  const integral = new Float64Array(n)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      rowSum += gray[i]
      integral[i] = (y > 0 ? integral[i - w] : 0) + rowSum
    }
  }
  const S = Math.max(8, Math.floor(w / 16)) // window size
  const half = Math.floor(S / 2)
  const T = 0.15 // 15% below local mean → black
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half)
      const y0 = Math.max(0, y - half)
      const x1 = Math.min(w - 1, x + half)
      const y1 = Math.min(h - 1, y + half)
      const count = (x1 - x0) * (y1 - y0)
      const A = x0 > 0 && y0 > 0 ? integral[(y0 - 1) * w + (x0 - 1)] : 0
      const B = y0 > 0 ? integral[(y0 - 1) * w + x1] : 0
      const C = x0 > 0 ? integral[y1 * w + (x0 - 1)] : 0
      const Dd = integral[y1 * w + x1]
      const sum = Dd - B - C + A
      const i = y * w + x
      const o = i * 4
      const v = gray[i] * count <= sum * (1 - T) ? 0 : 255
      d[o] = v; d[o + 1] = v; d[o + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Promisified canvas → JPEG Blob. */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/jpeg',
      quality,
    )
  })
}
