import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { listUncachedRecipeImages } from '@/lib/image-cache'

/**
 * GET /api/images/uncached
 *
 * Returns all recipe image URLs (across every family) that are external
 * (http/https) but not yet cached on disk. Used by the warm-image-cache
 * ops script to populate the cache from a machine that can reach the image host.
 *
 * Cross-family by design — it is an ops task, not a per-user view — so it is
 * NOT a logged-in session route. Instead it is guarded by the IMAGE_CACHE_TOKEN
 * secret (mirrors the ADMIN_RESET_TOKEN break-glass pattern): the warm script
 * sends the token in the x-cache-token header. Fails closed if the token is
 * absent or mismatched, including when the env var is unset.
 */
async function _GET(req: Request) {
  const token = req.headers.get('x-cache-token')
  if (!token || token !== process.env.IMAGE_CACHE_TOKEN) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    console.warn(`[images/uncached] Rejected attempt with invalid token from ${ip}`)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const uncached = await listUncachedRecipeImages()
  return NextResponse.json(uncached)
}

export const GET = withRouteErrors(_GET)
