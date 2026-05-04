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
 *   recipeIds: string[],          // Top N recipe IDs for detail page warming
 *   recipeImages: { url: string, cachePath: string | null }[],  // Recipe image URLs for pre-caching
 *   warmPages: string[]           // Main nav pages (same as WARM_PAGES in SW)
 * }
 */
export async function GET() {
  // Get the most recent recipes (limit to 20 for warming)
  const recipes = await prisma.recipe.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      image: true,
    },
  })

  const recipeIds = recipes.map((r) => r.id)

  // Collect image URLs that can be pre-cached by the SW
  const recipeImages = recipes
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
