import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export interface IncomeStream {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'yearly'
  isIncluded: boolean
}

function generateId() {
  return randomBytes(8).toString('hex')
}

export async function GET() {
  const session = await requireSession()
  const family = await prisma.family.findUnique({
    where: { id: session.familyId },
    select: { budgetIncomeStreams: true },
  })
  const streams: IncomeStream[] = family?.budgetIncomeStreams
    ? JSON.parse(family.budgetIncomeStreams)
    : []
  return NextResponse.json(streams)
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const streams: IncomeStream[] = await request.json()

  // Validate and sanitise
  const sanitised = streams.map((s) => ({
    id: s.id || generateId(),
    name: String(s.name || '').trim(),
    amount: parseFloat(String(s.amount)) || 0,
    frequency: ['weekly', 'fortnightly', 'monthly', 'yearly'].includes(s.frequency)
      ? s.frequency
      : 'monthly',
    isIncluded: Boolean(s.isIncluded),
  })).filter((s) => s.name)

  await prisma.family.update({
    where: { id: session.familyId },
    data: { budgetIncomeStreams: JSON.stringify(sanitised) },
  })

  return NextResponse.json(sanitised)
}
