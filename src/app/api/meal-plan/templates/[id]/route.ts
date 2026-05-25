import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const template = await prisma.mealPlanTemplate.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      slots: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { dayOffset: 'asc' },
      },
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  return NextResponse.json(template)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const template = await prisma.mealPlanTemplate.findFirst({
    where: { id, familyId: user.familyId },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  await prisma.mealPlanTemplate.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { weekStart } = body

  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart is required' }, { status: 400 })
  }

  // Fetch the template
  const template = await prisma.mealPlanTemplate.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      slots: true,
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  // Calculate the week range
  const startDate = new Date(weekStart + 'T00:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  // Apply each slot as a meal plan entry
  const results = []
  for (const slot of template.slots) {
    const slotDate = new Date(startDate)
    slotDate.setDate(slotDate.getDate() + slot.dayOffset)
    const normalized = new Date(
      Date.UTC(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate())
    )

    const plan = await prisma.mealPlan.upsert({
      where: {
        familyId_date_mealType: {
          familyId: user.familyId,
          date: normalized,
          mealType: slot.mealType,
        },
      },
      create: {
        date: normalized,
        mealType: slot.mealType,
        note: slot.note,
        recipeId: slot.recipeId,
        familyId: user.familyId,
      },
      update: {
        note: slot.note,
        recipeId: slot.recipeId,
      },
      include: {
        recipe: { select: { id: true, title: true } },
        recipes: {
          include: {
            recipe: { select: { id: true, title: true } },
          },
          orderBy: { order: 'asc' },
        },
      },
    })

    results.push({
      ...plan,
      date: plan.date.toISOString(),
    })
  }

  return NextResponse.json({ applied: results.length, entries: results })
}
