import { NextResponse } from 'next/server'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const IMAGES_DIR = join(process.cwd(), 'data', 'images')

/**
 * GET /api/images/:cachePath?url=<originalUrl>
 *
 * Serves recipe images from the local filesystem cache.
 * If the image isn't cached yet, it fetches it from the original URL,
 * caches it locally, and serves it. This builds the cache naturally
 * as users browse recipes.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  // The [...path] catch-all will have exactly one segment (the filename).
  // Rejoin just to be safe, but a real filename never contains slashes.
  const cachePath = path.join('/')

  // Security: prevent directory traversal.
  // Note: we allow '/' because path.join('/') on a single-segment array is fine;
  // we only block '..' sequences and multiple nested slashes (e.g. "../../etc").
  if (cachePath.includes('..') || path.length > 1) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const filepath = join(IMAGES_DIR, cachePath)

  // If cached locally, serve from disk
  if (existsSync(filepath)) {
    try {
      const buffer = await readFile(filepath)
      const ext = cachePath.split('.').pop()?.toLowerCase()
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': getContentType(ext),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new NextResponse('Not found', { status: 404 })
    }
  }

  // Not cached - try to fetch from original URL (passed as query param)
  const { searchParams } = new URL(req.url)
  const originalUrl = searchParams.get('url')

  if (!originalUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const response = await fetch(originalUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HomebaseBot/1.0; +https://homebase.family)',
      },
    })

    if (!response.ok) {
      return new NextResponse('Failed to fetch image', { status: 502 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Cache locally for next time (fire and forget — errors are non-fatal)
    ;(async () => {
      try {
        await mkdir(IMAGES_DIR, { recursive: true })
        await writeFile(filepath, buffer)
        console.log(`[ImageCache] Cached image -> ${cachePath}`)
      } catch (err) {
        console.warn(`[ImageCache] Failed to write cache file ${cachePath}:`, err instanceof Error ? err.message : err)
      }
    })()

    // Determine content type from response or extension
    const contentType = response.headers.get('content-type') || getContentType(cachePath.split('.').pop()?.toLowerCase())

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 })
  }
}

function getContentType(ext: string | undefined): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}
