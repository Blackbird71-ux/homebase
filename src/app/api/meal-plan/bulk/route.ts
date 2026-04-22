import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  try {
    // Delete all meal plans for the family within the date range
    const result = await prisma.mealPlan.deleteMany({
      where: {
        familyId: user.familyId,
        date: { gte: fromDate, lte: toDate },
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Cleared ${result.count} meal plan entries`,
    })
  } catch (error) {
    console.error('Failed to bulk delete meal plans:', error)
    return NextResponse.json(
      { error: 'Failed to clear meal plan. Please try again.' },
      { status: 500 }
    )
  }
}