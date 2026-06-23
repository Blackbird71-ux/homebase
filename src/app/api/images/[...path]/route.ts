import { NextResponse } from 'next/server'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { imageFetchHeaders } from '@/lib/image-cache'

// Use absolute /data path — process.cwd() in the standalone build is /app, not /data
const IMAGES_DIR = join(process.env.DATA_DIR ?? '/data', 'images')

/**
 * GET /api/images/:cachePath?url=<originalUrl>
 *
 * Serves recipe images from the local filesystem cache.
 * On first request, fetches from the original URL, caches to disk, and serves.
 * Subsequent requests are served directly from disk.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const cachePath = path.join('/')

  // Security: only allow single-segment md5-style filenames
  if (cachePath.includes('..') || path.length > 1) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const filepath = join(IMAGES_DIR, cachePath)

  // Serve from disk cache if available
  if (existsSync(filepath)) {
    try {
      const buffer = await readFile(filepath)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': getContentType(cachePath.split('.').pop()?.toLowerCase()),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return new NextResponse('Not found', { status: 404 })
    }
  }

  // Not cached yet — fetch from original URL
  const originalUrl = new URL(req.url).searchParams.get('url')
  if (!originalUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const response = await fetch(originalUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: imageFetchHeaders(originalUrl),
    })

    if (!response.ok) {
      // Upstream rejected server-side fetch (auth-gated, CDN block, etc.)
      // Redirect the browser to fetch it directly — images still display.
      console.warn(`[ImageCache] Upstream ${response.status} for ${originalUrl} — redirecting to source`)
      return NextResponse.redirect(originalUrl, { status: 302 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') || getContentType(cachePath.split('.').pop()?.toLowerCase())

    // Write to cache (fire and forget — non-fatal)
    ;(async () => {
      try {
        await mkdir(IMAGES_DIR, { recursive: true })
        await writeFile(filepath, buffer)
        console.log(`[ImageCache] Cached -> ${cachePath}`)
      } catch (err) {
        console.warn(`[ImageCache] Write failed for ${cachePath}:`, err instanceof Error ? err.message : err)
      }
    })()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    // Network-level failure (timeout, DNS, etc.) — redirect browser to try directly
    console.warn(`[ImageCache] Fetch error for ${originalUrl}:`, err instanceof Error ? err.message : err)
    return NextResponse.redirect(originalUrl, { status: 302 })
  }
}

function getContentType(ext: string | undefined): string {
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'avif': return 'image/avif'
    default: return 'image/jpeg'
  }
}
