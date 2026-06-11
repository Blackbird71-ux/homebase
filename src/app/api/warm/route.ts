import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getCachePath, isCached } from '@/lib/image-cache'
import { buildEventsQuery, calendarSettingsFromPrefs } from '@/lib/event-helpers'
import { todayStringInTz } from '@/lib/timezone'
import { scopeDateRange } from '@/hooks/meal-plan/types'

/**
 * GET /api/warm
 *
 * Returns data the service worker can use to pre-cache content for offline use.
 * recipeIds/recipeImages/warmPages need no auth — they only contain IDs and
 * URLs already accessible from the client. apiUrls is computed from the
 * session user's settings (timezone, weekStartsOn, calendar toggles) so each
 * URL byte-matches the request the corresponding view makes — a warmed cache
 * entry only serves offline if the URLs are identical. Without a session,
 * apiUrls is empty.
 *
 * Response:
 * {
 *   recipeIds: string[],          // Recipe IDs for detail page warming, newest first.
 *                                 // The SW warms full HTML+RSC for the first 20 and
 *                                 // RSC-only for the rest (client-nav offline coverage).
 *   recipeImages: { url: string, cachePath: string | null }[],  // Recipe image URLs for pre-caching
 *   warmPages: string[],          // Main nav pages (same as WARM_PAGES in SW)
 *   apiUrls: string[]             // Data API URLs to warm into the SW API cache
 * }
 */
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined

  let apiUrls: string[] = []
  if (user?.id) {
    const timezone = user.timezone ?? 'UTC'
    const weekStartsOn = (user.weekStartsOn === 0 ? 0 : 1) as 0 | 1
    const [fullUser, lists] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { uiPreferences: true } }),
      prisma.list.findMany({
        where: { familyId: user.familyId, isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ])

    // Same URL CalendarView.refresh builds for the default month view of today.
    const eventsQuery = buildEventsQuery(
      'month', new Date(), timezone, weekStartsOn,
      calendarSettingsFromPrefs(fullUser?.uiPreferences)
    )
    // Same from/to the meal-plan page computes: today in the family tz, 7-day scope.
    // The server runs in UTC, so local Date components match the tz date string.
    const { from, to } = scopeDateRange(new Date(todayStringInTz(timezone) + 'T00:00:00'), 7)

    apiUrls = [
      '/api/lists',
      ...lists.map((l) => `/api/lists/${l.id}/items`),
      '/api/chores',
      '/api/chores/schedule?scope=7',
      `/api/events?${eventsQuery}`,
      `/api/meal-plan?from=${from}&to=${to}`,
      '/api/recipes',
      '/api/event-categories',
      '/api/ingredient-categories',
    ]
  }

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
    apiUrls,
  })
}
