import { NextResponse } from 'next/server'
import { readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

const IMAGES_DIR = join(process.cwd(), 'data', 'images')

/**
 * GET /api/images/:cachePath
 *
 * Serves cached recipe images from the local filesystem.
 * If the image doesn't exist locally, it returns a 404.
 * Images are cached during import or on first access via the image-cache utility.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const cachePath = path.join('/')

  // Security: prevent directory traversal
  if (cachePath.includes('..') || cachePath.includes('/')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const filepath = join(IMAGES_DIR, cachePath)

  if (!existsSync(filepath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const buffer = await readFile(filepath)

    // Determine content type from extension
    const ext = cachePath.split('.').pop()?.toLowerCase()
    const contentType = getContentType(ext)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
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
