import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export interface IncomeStream {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  // Custom frequency fields – only used when frequency === 'custom'
  customInterval?: number | null   // e.g. 6
  customUnit?: 'days' | 'weeks' | 'months' | 'years' | null  // e.g. 'months' → every 6 months
  isIncluded: boolean
  entityId?: string | null  // null/undefined = personal/family entity
}

const VALID_FREQUENCIES = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'custom']
const VALID_UNITS = ['days', 'weeks', 'months', 'years']

function generateId() {
  return randomBytes(8).toString('hex')
}

/** Convert a stream's amount to a monthly equivalent for budget summaries. */
export function streamToMonthly(s: IncomeStream): number {
  const { amount, frequency, customInterval, customUnit } = s
  switch (frequency) {
    case 'weekly':      return amount * 52 / 12
    case 'fortnightly': return amount * 26 / 12
    case 'monthly':     return amount
    case 'quarterly':   return amount / 3
    case 'yearly':      return amount / 12
    case 'custom': {
      if (!customInterval || !customUnit || customInterval <= 0) return amount
      // Convert custom period to months-equivalent, then compute monthly rate
      let periodsPerYear: number
      switch (customUnit) {
        case 'days':   periodsPerYear = 365 / customInterval; break
        case 'weeks':  periodsPerYear = 52  / customInterval; break
        case 'months': periodsPerYear = 12  / customInterval; break
        case 'years':  periodsPerYear = 1   / customInterval; break
        default:       periodsPerYear = 1
      }
      return amount * periodsPerYear / 12
    }
    default: return amount
  }
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

  const sanitised = streams.map((s) => {
    const freq = VALID_FREQUENCIES.includes(s.frequency) ? s.frequency : 'monthly'
    const isCustom = freq === 'custom'
    return {
      id: s.id || generateId(),
      name: String(s.name || '').trim(),
      amount: parseFloat(String(s.amount)) || 0,
      frequency: freq as IncomeStream['frequency'],
      customInterval: isCustom && s.customInterval ? Math.max(1, parseInt(String(s.customInterval))) : null,
      customUnit: isCustom && s.customUnit && VALID_UNITS.includes(s.customUnit) ? s.customUnit : null,
      isIncluded: Boolean(s.isIncluded),
      entityId: s.entityId ?? null,
    }
  }).filter((s) => s.name)

  await prisma.family.update({
    where: { id: session.familyId },
    data: { budgetIncomeStreams: JSON.stringify(sanitised) },
  })

  return NextResponse.json(sanitised)
}
