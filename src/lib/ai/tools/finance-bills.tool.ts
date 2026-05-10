// src/lib/ai/tools/finance-bills.tool.ts
// AI tool registrations for bill/payment operations.
// Provides: queryBills, markBillPaid, queryBillDetails

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function billsContextProvider(familyId: string, _userId: string): Promise<string> {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [totalBills, upcomingBills, overdueBills, unpaidCount, monthlyTotal] = await Promise.all([
    prisma.financeRecurringBill.count({ where: { familyId, isActive: true } }),
    prisma.financeRecurringBill.findMany({
      where: {
        familyId,
        isActive: true,
        paid: false,
        nextDueDate: { gte: now, lte: thirtyDaysFromNow },
      },
      select: { name: true, amount: true, nextDueDate: true, frequency: true },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.financeRecurringBill.findMany({
      where: {
        familyId,
        isActive: true,
        paid: false,
        nextDueDate: { lt: now },
      },
      select: { name: true, amount: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.financeRecurringBill.count({
      where: { familyId, isActive: true, paid: false },
    }),
    prisma.financeRecurringBill.aggregate({
      where: { familyId, isActive: true, paid: false },
      _sum: { amount: true },
    }),
  ])

  const parts: string[] = []

  parts.push(`You have ${totalBills} active bills. ${unpaidCount} unpaid, totaling $${(monthlyTotal._sum.amount ?? 0).toFixed(2)}.`)

  if (overdueBills.length > 0) {
    const lines = overdueBills.map(b =>
      `"${b.name}" — $${b.amount.toFixed(2)} — was due ${new Date(b.nextDueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    )
    parts.push(`Overdue bills:\n${lines.join('\n')}`)
  }

  if (upcomingBills.length > 0) {
    const lines = upcomingBills.map(b =>
      `"${b.name}" — $${b.amount.toFixed(2)} — due ${new Date(b.nextDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    )
    parts.push(`Upcoming bills (next 30 days):\n${lines.join('\n')}`)
  }

  if (overdueBills.length === 0 && upcomingBills.length === 0 && totalBills > 0) {
    parts.push('All bills are paid or no bills due in the next 30 days.')
  }

  return `Bills summary:\n${parts.join('\n\n')}`
}

// ── queryBills ────────────────────────────────────────────────────────────────

const queryBillsDefinition: FunctionDeclaration = {
  name: 'queryBills',
  description: 'Look up bills that are due, overdue, upcoming, or paid. Use this when the user asks "what bills are due?", "show me upcoming bills", "what do I need to pay?", "any bills overdue?", or "what bills did we pay this month?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filter: {
        type: SchemaType.STRING,
        description: 'Optional filter: "overdue" for past-due unpaid bills, "upcoming" for bills due in the next 30 days, "paid" for recently paid bills, "all" for all active bills. Omit for a default summary.',
      },
    },
  },
}

async function queryBillsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { filter } = args as { filter?: string }
  const now = new Date()

  let bills
  let label: string

  switch (filter) {
    case 'overdue': {
      bills = await prisma.financeRecurringBill.findMany({
        where: {
          familyId: ctx.familyId,
          isActive: true,
          paid: false,
          nextDueDate: { lt: now },
        },
        include: {
          account: { select: { name: true } },
          category: { select: { name: true } },
          vendor: { select: { name: true } },
        },
        orderBy: { nextDueDate: 'asc' },
      })
      label = 'Overdue bills'
      break
    }
    case 'upcoming': {
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      bills = await prisma.financeRecurringBill.findMany({
        where: {
          familyId: ctx.familyId,
          isActive: true,
          paid: false,
          nextDueDate: { gte: now, lte: thirtyDaysFromNow },
        },
        include: {
          account: { select: { name: true } },
          category: { select: { name: true } },
          vendor: { select: { name: true } },
        },
        orderBy: { nextDueDate: 'asc' },
      })
      label = 'Upcoming bills (next 30 days)'
      break
    }
    case 'paid': {
      bills = await prisma.financeRecurringBill.findMany({
        where: {
          familyId: ctx.familyId,
          isActive: true,
          paid: true,
        },
        include: {
          account: { select: { name: true } },
          category: { select: { name: true } },
          vendor: { select: { name: true } },
        },
        orderBy: { paidDate: 'desc' },
        take: 20,
      })
      label = 'Recently paid bills'
      break
    }
    default: {
      bills = await prisma.financeRecurringBill.findMany({
        where: { familyId: ctx.familyId, isActive: true },
        include: {
          account: { select: { name: true } },
          category: { select: { name: true } },
          vendor: { select: { name: true } },
        },
        orderBy: { nextDueDate: 'asc' },
      })
      label = 'All active bills'
      break
    }
  }

  if (bills.length === 0) {
    const msg = filter === 'overdue' ? 'No overdue bills — nice!' : filter === 'upcoming' ? 'No upcoming bills in the next 30 days.' : filter === 'paid' ? 'No paid bills found.' : 'No active bills. Add some in Finance → Bills.'
    return { message: msg }
  }

  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0)
  const unpaidOnly = bills.filter(b => !b.paid)
  const unpaidTotal = unpaidOnly.reduce((sum, b) => sum + b.amount, 0)

  const lines = bills.map(b => {
    const status = b.paid ? `✅ Paid${b.paidDate ? ` ${new Date(b.paidDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}` : `⚠️ Due ${new Date(b.nextDueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    const detail = [b.category?.name, b.vendor?.name, b.account?.name].filter(Boolean).join(', ')
    const detailPart = detail ? ` (${detail})` : ''
    return `• ${b.name} — $${b.amount.toFixed(2)} — ${status}${detailPart}`
  })

  const summary = unpaidOnly.length > 0
    ? `\n\n${unpaidOnly.length} unpaid, totaling $${unpaidTotal.toFixed(2)}.`
    : '\n\nAll bills are paid!'

  return { message: `${label}:\n${lines.join('\n')}${summary}` }
}

// ── markBillPaid ──────────────────────────────────────────────────────────────

const markBillPaidDefinition: FunctionDeclaration = {
  name: 'markBillPaid',
  description: 'Mark a bill as paid. Use this when the user says "I paid the electricity bill", "mark Netflix as paid", "the mortgage is paid for this month", or "I\'ve paid the water bill".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      billName: { type: SchemaType.STRING, description: 'The name (or partial name) of the bill to mark as paid' },
      amount: { type: SchemaType.NUMBER, description: 'Optional: the actual amount paid if different from the expected amount' },
    },
    required: ['billName'],
  },
}

async function markBillPaidHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { billName, amount } = args as { billName: string; amount?: number }
  const lower = billName.toLowerCase()

  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: ctx.familyId, isActive: true, paid: false },
    select: { id: true, name: true, amount: true, nextDueDate: true, frequency: true },
  })

  // Find best match — use let + sequential checks for TypeScript narrowing
  let match = bills.find(b => b.name.toLowerCase().includes(lower))
  if (!match) {
    match = bills.find(b => lower.includes(b.name.toLowerCase()))
  }
  if (!match) {
    return { message: `No unpaid bill found matching "${billName}". Check the name or try "queryBills" to see what's due.` }
  }

  const paidAmount = amount ?? match.amount

  await prisma.financeRecurringBill.update({
    where: { id: match.id },
    data: {
      paid: true,
      paidDate: new Date(),
      ...(amount ? { amount: amount } : {}),
    },
  })

  return {
    message: `"${match.name}" marked as paid — $${paidAmount.toFixed(2)}.`,
    action: 'markBillPaid',
  }
}

// ── queryBillDetails ──────────────────────────────────────────────────────────

const queryBillDetailsDefinition: FunctionDeclaration = {
  name: 'queryBillDetails',
  description: 'Get full details of a specific bill including the account, category, vendor, frequency, and next due date. Use this when the user asks "tell me about the electricity bill", "what are the details of the mortgage?", or "show me the Netflix subscription details".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      billName: { type: SchemaType.STRING, description: 'The name or partial name of the bill to look up' },
    },
    required: ['billName'],
  },
}

async function queryBillDetailsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { billName } = args as { billName: string }
  const lower = billName.toLowerCase()

  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: ctx.familyId, isActive: true },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true, type: true } },
      vendor: { select: { name: true } },
      location: { select: { name: true } },
    },
  })

  const match = bills.find(b => b.name.toLowerCase().includes(lower))
    ?? bills.find(b => lower.includes(b.name.toLowerCase()))

  if (!match) {
    return { message: `No bill found matching "${billName}".` }
  }

  const dueDate = new Date(match.nextDueDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const endDate = match.endDate ? new Date(match.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'No end date'
  const freqLabel = match.frequency.charAt(0).toUpperCase() + match.frequency.slice(1)

  const details = [
    `💰 Amount: $${match.amount.toFixed(2)}`,
    `📅 Frequency: ${freqLabel}`,
    `📆 Next due: ${dueDate}`,
    `🏁 End date: ${endDate}`,
    `📊 Status: ${match.paid ? '✅ Paid' : '⚠️ Unpaid'}`,
    match.account ? `🏦 Account: ${match.account.name}` : null,
    match.category ? `📁 Category: ${match.category.name} (${match.category.type})` : null,
    match.vendor ? `🏢 Vendor: ${match.vendor.name}` : null,
    match.location ? `📍 Location: ${match.location.name}` : null,
    match.billType ? `📋 Type: ${match.billType}` : null,
    match.autoPay ? '🤖 Auto-pay: Yes' : null,
    match.notes ? `📝 Notes: ${match.notes}` : null,
  ].filter(Boolean)

  return { message: `**${match.name}**\n${details.join('\n')}` }
}

// ── Register all bill tools ───────────────────────────────────────────────────

export function registerFinanceBillTools(): void {
  registerTool('queryBills', {
    definition: queryBillsDefinition,
    contextProvider: billsContextProvider,
    handler: queryBillsHandler,
  })

  registerTool('markBillPaid', {
    definition: markBillPaidDefinition,
    handler: markBillPaidHandler,
    actionEvents: { markBillPaid: 'app:financeUpdated' },
  })

  registerTool('queryBillDetails', {
    definition: queryBillDetailsDefinition,
    handler: queryBillDetailsHandler,
  })
}
