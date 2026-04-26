import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCachePath, isCached } from '@/lib/image-cache'

/**
 * GET /api/images/uncached
 *
 * Returns all recipe image URLs that are external (http/https) but not yet
 * cached on disk. Used by the warm-image-cache script to populate the cache
 * from a machine that can reach the image host.
 *
 * No auth required — image URLs are not sensitive (images are publicly accessible).
 */
export async function GET() {
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

  return NextResponse.json(uncached)
}
