import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

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
 * Download and cache an external image server-side.
 * Returns the local cache path on success, null on failure.
 */
export async function cacheImage(imageUrl: string): Promise<string | null> {
  const cachePath = getCachePath(imageUrl)
  if (!cachePath) return null
  if (isUncacheableUrl(imageUrl)) {
    console.log(`[ImageCache] Skipping uncacheable URL: ${imageUrl}`)
    return null
  }
  if (isCached(cachePath)) return cachePath

  try {
    await mkdir(IMAGES_DIR, { recursive: true })
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HomebaseBot/1.0)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })
    if (!response.ok) {
      console.warn(`[ImageCache] Failed to download ${imageUrl}: ${response.status}`)
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(getCacheFilePath(cachePath), buffer)
    console.log(`[ImageCache] Cached ${imageUrl} -> ${cachePath}`)
    return cachePath
  } catch (err) {
    console.warn(`[ImageCache] Error caching ${imageUrl}:`, err instanceof Error ? err.message : err)
    return null
  }
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

  // Uncacheable URLs — serve from disk if already warmed, otherwise let browser fetch directly
  if (isUncacheableUrl(imageUrl)) {
    const cachePath = getCachePath(imageUrl)
    if (cachePath && isCached(cachePath)) return `/api/images/${cachePath}`
    return imageUrl
  }

  // External URL — route through our proxy so it gets cached on first hit
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
