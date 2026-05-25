import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { familyId } = user

  const [family, events, lists, recipes, mealPlans, coziImports] = await Promise.all([
    prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true, name: true },
    }),
    prisma.event.findMany({
      where: { familyId },
      orderBy: { start: 'asc' },
    }),
    prisma.list.findMany({
      where: { familyId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.recipe.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.mealPlan.findMany({
      where: { familyId },
      include: { recipe: { select: { title: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.coziImport.findMany({
      where: { familyId },
      orderBy: { importedAt: 'desc' },
    }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    family,
    events,
    lists,
    recipes,
    mealPlans,
    coziImports,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="homebase-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
