import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.mealPlanTemplate.findMany({
    where: { familyId: user.familyId },
    include: {
      slots: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { dayOffset: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(templates)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, weekStart } = body

  if (!name || !weekStart) {
    return NextResponse.json({ error: 'name and weekStart are required' }, { status: 400 })
  }

  // Calculate the week range
  const startDate = new Date(weekStart + 'T00:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  // Fetch all meal plans for this week
  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
      },
    },
  })

  // Create the template with slots
  const template = await prisma.mealPlanTemplate.create({
    data: {
      name,
      familyId: user.familyId,
      slots: {
        create: mealPlans.map((plan) => {
          const planDate = new Date(plan.date)
          const dayOffset = (planDate.getDay() - startDate.getDay() + 7) % 7
          return {
            dayOffset,
            mealType: plan.mealType,
            recipeId: plan.recipeId,
            note: plan.note,
          }
        }),
      },
    },
    include: {
      slots: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { dayOffset: 'asc' },
      },
    },
  })

  return NextResponse.json(template, { status: 201 })
}
