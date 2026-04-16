import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 })
  }

  const plans = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    include: { recipe: { select: { id: true, title: true } } },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(
    plans.map((p) => ({
      ...p,
      date: p.date.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { date, mealType, recipeId, note } = body

  if (!date || !mealType) {
    return NextResponse.json({ error: 'date and mealType are required' }, { status: 400 })
  }

  const dateObj = new Date(date)
  // Normalize to midnight UTC for consistent upsert key
  const normalized = new Date(
    Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())
  )

  const plan = await prisma.mealPlan.upsert({
    where: {
      familyId_date_mealType: {
        familyId: user.familyId,
        date: normalized,
        mealType,
      },
    },
    create: {
      date: normalized,
      mealType,
      recipeId: recipeId ?? null,
      note: note ?? null,
      familyId: user.familyId,
    },
    update: {
      recipeId: recipeId ?? null,
      note: note ?? null,
    },
    include: { recipe: { select: { id: true, title: true } } },
  })

  return NextResponse.json({ ...plan, date: plan.date.toISOString() }, { status: 201 })
}
