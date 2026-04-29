import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()

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
