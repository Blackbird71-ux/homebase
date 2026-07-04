import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recipes = await (prisma as any).recipe.findMany({
    where: { familyId: user.familyId },
    select: { id: true, tags: true },
  })

  const legacyTagNames = new Set<string>()
  for (const recipe of recipes) {
    if (!recipe.tags) continue
    const names = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0 && t !== 'legacy-tags')
    names.forEach((n: string) => legacyTagNames.add(n))
  }

  return NextResponse.json({ count: legacyTagNames.size })
}

export const GET = withRouteErrors(_GET)
