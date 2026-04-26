import { writeFile, mkdir } from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

const IMAGES_DIR = join(process.cwd(), 'data', 'images')

/**
 * Get the local cache path for an external image URL.
 * Returns null if the image is not an external URL (e.g. already a local path).
 */
export function getCachePath(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null

  // If it's already a local path (starts with /uploads or /images), don't cache
  if (imageUrl.startsWith('/')) return null

  // Must be an external URL (http/https)
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) return null

  // Generate a deterministic filename from the URL
  const hash = crypto.createHash('md5').update(imageUrl).digest('hex')
  const ext = getExtension(imageUrl)
  return `${hash}${ext}`
}

/**
 * Get the full filesystem path for a cached image.
 */
export function getCacheFilePath(cachePath: string): string {
  return join(IMAGES_DIR, cachePath)
}

/**
 * Check if an image is already cached locally.
 */
export function isCached(cachePath: string): boolean {
  return existsSync(getCacheFilePath(cachePath))
}

/**
 * Download and cache an external image.
 * Returns the local cache path on success, or null on failure.
 */
export async function cacheImage(imageUrl: string): Promise<string | null> {
  const cachePath = getCachePath(imageUrl)
  if (!cachePath) return null

  // Already cached
  if (isCached(cachePath)) return cachePath

  try {
    // Ensure images directory exists
    await mkdir(IMAGES_DIR, { recursive: true })

    // Download the image
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HomebaseBot/1.0; +https://homebase.family)',
      },
    })

    if (!response.ok) {
      console.warn(`[ImageCache] Failed to download ${imageUrl}: ${response.status}`)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const filepath = getCacheFilePath(cachePath)
    await writeFile(filepath, buffer)

    console.log(`[ImageCache] Cached ${imageUrl} -> ${cachePath}`)
    return cachePath
  } catch (err) {
    console.warn(`[ImageCache] Error caching ${imageUrl}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Get the local URL path for serving a cached image.
 * If the image is already a local path, returns it as-is.
 * If it's an external URL, returns the proxy path that will serve from cache.
 */
export function getLocalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null

  // Already a local path (starts with /)
  if (imageUrl.startsWith('/')) return imageUrl

  // Bare filename (no path, no protocol) - treat as local upload
  // This handles legacy data where images were stored as just "filename.jpg"
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return `/uploads/${imageUrl}`
  }

  // External URL - return proxy path
  const cachePath = getCachePath(imageUrl)
  if (!cachePath) return imageUrl

  return `/api/images/${cachePath}`
}

/**
 * Get the file extension from a URL, defaulting to .jpg
 */
function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
      return `.${ext}`
    }
  } catch {
    // Invalid URL
  }
  return '.jpg'
}
