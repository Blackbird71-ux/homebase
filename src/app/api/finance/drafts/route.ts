import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await requireSession()

  const [bills, income] = await Promise.all([
    prisma.financeRecurringBill.findMany({
      where: { familyId: user.familyId, status: 'draft' },
      include: {
        template: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, type: true } },
      },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.financeIncomeEntry.findMany({
      where: { familyId: user.familyId, status: 'draft' },
      include: {
        template: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, type: true } },
        payslip: { select: { id: true, grossPay: true, netPay: true } },
        journalEntry: {
          select: {
            id: true,
            lines: { select: { glAccountId: true, side: true, amount: true, description: true } },
          },
        },
      },
      orderBy: { nextExpectedDate: 'asc' },
    }),
  ])

  return NextResponse.json({ bills, income })
}
