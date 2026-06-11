import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCachePath, isCached } from '@/lib/image-cache'

/**
 * GET /api/warm
 *
 * Returns data the service worker can use to pre-cache content for offline use.
 * No auth required — this only returns public-facing IDs and URLs that are
 * already accessible from the client. The SW uses this to warm the cache on
 * activation and via periodic background sync.
 *
 * Response:
 * {
 *   recipeIds: string[],          // Recipe IDs for detail page warming, newest first.
 *                                 // The SW warms full HTML+RSC for the first 20 and
 *                                 // RSC-only for the rest (client-nav offline coverage).
 *   recipeImages: { url: string, cachePath: string | null }[],  // Recipe image URLs for pre-caching
 *   warmPages: string[]           // Main nav pages (same as WARM_PAGES in SW)
 * }
 */
export async function GET() {
  // Newest first, capped at 200 to bound the SW warm pass
  const recipes = await prisma.recipe.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      image: true,
    },
  })

  const recipeIds = recipes.map((r) => r.id)

  // Collect image URLs that can be pre-cached by the SW — top 20 only, to
  // bound bandwidth (matches the SW's full-page warm depth)
  const recipeImages = recipes
    .slice(0, 20)
    .filter((r) => r.image && (r.image.startsWith('http://') || r.image.startsWith('https://')))
    .map((r) => {
      const cachePath = getCachePath(r.image)
      return {
        url: r.image!,
        cachePath, // null if uncacheable (e.g. /_next/image)
        alreadyCached: cachePath ? isCached(cachePath) : false,
      }
    })

  return NextResponse.json({
    recipeIds,
    recipeImages,
    warmPages: [
      '/meal-plan',
      '/recipes',
      '/lists',
      '/calendar',
      '/notes',
      '/contacts',
    ],
  })
}
