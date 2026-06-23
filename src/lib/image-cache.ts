import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// Use absolute /data path so it resolves correctly inside the Docker container.
// process.cwd() in a Next.js standalone build is /app, not /data.
// In local dev, set DATA_DIR=./data in .env.local.
const DATA_DIR = process.env.DATA_DIR ?? '/data'
const IMAGES_DIR = join(DATA_DIR, 'images')
const UPLOADS_DIR = join(DATA_DIR, 'uploads')

/**
 * Get the deterministic cache filename for an external image URL.
 * Returns null if the URL is already local or not http/https.
 */
export function getCachePath(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  if (imageUrl.startsWith('/')) return null
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) return null

  const hash = crypto.createHash('md5').update(imageUrl).digest('hex')
  const ext = getExtension(imageUrl)
  return `${hash}${ext}`
}

export function getCacheFilePath(cachePath: string): string {
  return join(IMAGES_DIR, cachePath)
}

export function isCached(cachePath: string): boolean {
  return existsSync(getCacheFilePath(cachePath))
}

/**
 * Returns true for URLs that block server-side fetches (e.g. Next.js image
 * optimization endpoints). These must be fetched directly by the browser.
 */
function isUncacheableUrl(imageUrl: string): boolean {
  try {
    const { pathname } = new URL(imageUrl)
    return pathname.startsWith('/_next/image') || pathname.includes('/api/image/')
  } catch {
    return false
  }
}

/**
 * Browser-like request headers for fetching an upstream image. Some image hosts
 * (e.g. recipe-site Next.js image optimizers) reject bare bot fetches, so we send
 * a real User-Agent, image Accept set, and an origin-based Referer — the same
 * headers the warm-image-cache ops script uses, which is proven to succeed.
 */
export function imageFetchHeaders(imageUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  try {
    headers['Referer'] = `${new URL(imageUrl).origin}/`
  } catch { /* invalid URL — omit Referer */ }
  return headers
}

/**
 * Download an external image and write it to the on-disk cache at `cachePath`.
 * Pure fetch+write core shared by {@link cacheImage} (lazy, display-gated) and
 * {@link warmRecipeImageCache} (explicit warming). Returns true on success.
 */
async function downloadToCache(imageUrl: string, cachePath: string): Promise<boolean> {
  try {
    await mkdir(IMAGES_DIR, { recursive: true })
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: imageFetchHeaders(imageUrl),
    })
    if (!response.ok) {
      console.warn(`[ImageCache] Failed to download ${imageUrl}: ${response.status}`)
      return false
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(getCacheFilePath(cachePath), buffer)
    console.log(`[ImageCache] Cached ${imageUrl} -> ${cachePath}`)
    return true
  } catch (err) {
    console.warn(`[ImageCache] Error caching ${imageUrl}:`, err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Download and cache an external image server-side for lazy/on-import use.
 * Skips URLs classified uncacheable for the *display* path (served raw to the
 * browser instead — see getLocalImageUrl). Returns the cache path on success.
 * For deliberate warming of those URLs, use {@link warmRecipeImageCache}.
 */
export async function cacheImage(imageUrl: string): Promise<string | null> {
  const cachePath = getCachePath(imageUrl)
  if (!cachePath) return null
  if (isUncacheableUrl(imageUrl)) {
    console.log(`[ImageCache] Skipping uncacheable URL: ${imageUrl}`)
    return null
  }
  if (isCached(cachePath)) return cachePath
  return (await downloadToCache(imageUrl, cachePath)) ? cachePath : null
}

/**
 * Convert a raw image URL (from the DB) to the URL that should be used in the UI.
 * External URLs are routed through /api/images/ which caches on first request.
 */
export function getLocalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null

  // Already a local path
  if (imageUrl.startsWith('/')) return imageUrl

  // Bare filename — legacy uploads stored without path prefix
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    const uploadPath = join(UPLOADS_DIR, imageUrl)
    if (existsSync(uploadPath)) return `/uploads/${imageUrl}`
    console.warn(`[ImageCache] Upload file not found: ${imageUrl}`)
    return null
  }

  // External URL — route through our proxy so it self-warms (caches) on first
  // view. The serving route fetches + writes to disk, and falls back to a 302
  // redirect to the source if a host blocks the server fetch, so display never
  // breaks. This includes recipe-site /api/image/ optimizer URLs, which the
  // proxy caches fine — previously they were passed through raw and never warmed.
  const cachePath = getCachePath(imageUrl)
  if (!cachePath) return imageUrl
  return `/api/images/${cachePath}?url=${encodeURIComponent(imageUrl)}`
}

function getExtension(url: string): string {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
      return `.${ext}`
    }
  } catch { /* invalid URL */ }
  return '.jpg'
}

/**
 * List the distinct external (http/https) recipe image URLs that are not yet
 * cached on disk, each paired with its deterministic cache filename.
 * Shared by the warm-cache ops endpoint and the in-app admin warm action.
 */
export async function listUncachedRecipeImages(): Promise<{ url: string; cachePath: string }[]> {
  const recipes = await prisma.recipe.findMany({
    select: { image: true },
    where: { image: { not: null } },
    distinct: ['image'],
  })

  const uncached: { url: string; cachePath: string }[] = []
  for (const { image } of recipes) {
    if (!image) continue
    if (!image.startsWith('http://') && !image.startsWith('https://')) continue
    const cachePath = getCachePath(image)
    if (!cachePath) continue
    if (isCached(cachePath)) continue
    uncached.push({ url: image, cachePath })
  }
  return uncached
}

export interface WarmCacheResult {
  /** Total uncached images found before this run */
  total: number
  /** How many were attempted this run (capped by `limit`) */
  attempted: number
  /** How many downloaded and cached successfully */
  cached: number
  /** How many failed to download (upstream error/timeout/unsupported) */
  failed: number
  /** How many remain uncached after this run (failures + any beyond the cap) */
  remaining: number
}

/**
 * Download and cache uncached recipe images server-side, in bounded-concurrency
 * batches. Caps the number attempted per call so a single request stays bounded
 * in time; the caller re-runs while `remaining > 0`.
 *
 * Unlike {@link cacheImage}, this deliberately warms URLs that the *display*
 * path classifies uncacheable (e.g. recipe-site `/api/image/` optimizer URLs,
 * normally served raw to the browser). Warming is explicit intent to store them
 * for offline use — exactly what the legacy warm-image-cache ops script did.
 */
export async function warmRecipeImageCache(limit = 100): Promise<WarmCacheResult> {
  const all = await listUncachedRecipeImages()
  const total = all.length
  const batch = all.slice(0, limit)

  let cached = 0
  let failed = 0
  const CONCURRENCY = 8
  let next = 0

  async function worker() {
    while (next < batch.length) {
      const { url, cachePath } = batch[next++]
      const ok = await downloadToCache(url, cachePath)
      if (ok) cached++
      else failed++
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker),
  )

  return { total, attempted: batch.length, cached, failed, remaining: total - cached }
}
