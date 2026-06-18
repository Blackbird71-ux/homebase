// src/lib/ai/tools/finance-bills.tool.ts
// AI tool registrations for bill/payment operations.
// Provides: queryBills, markBillPaid, queryBillDetails

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz, nDaysFromTodayInTz } from '@/lib/timezone'
import { ensureUndepositedFundsCategory } from '@/lib/finance-opening-balance'
import { recordBillPayment } from '@/lib/finance-bill-payment'
import { copySpawnedBillDraftJournal } from '@/lib/finance-draft-spawn-service'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'
import { liveBillWhere } from '@/lib/finance-live-filter'

// ── Context provider ──────────────────────────────────────────────────────────

async function billsContextProvider(familyId: string, _userId: string, timezone: string): Promise<string> {
  const now = new Date()
  const thirtyDaysFromNow = nDaysFromTodayInTz(30, timezone)

  const [totalBills, upcomingBills, overdueBills, unpaidCount, monthlyTotal] = await Promise.all([
    prisma.financeRecurringBill.count({ where: { familyId, isActive: true, ...liveBillWhere } }),
    prisma.financeRecurringBill.findMany({
      where: {
        familyId,
        isActive: true,
        paid: false,
        nextDueDate: { gte: now, lte: thirtyDaysFromNow },
        ...liveBillWhere,
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
        ...liveBillWhere,
      },
      select: { name: true, amount: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.financeRecurringBill.count({
      where: { familyId, isActive: true, paid: false, ...liveBillWhere },
    }),
    prisma.financeRecurringBill.aggregate({
      where: { familyId, isActive: true, paid: false, ...liveBillWhere },
      _sum: { amount: true },
    }),
  ])

  const parts: string[] = []

  parts.push(`You have ${totalBills} active bills. ${unpaidCount} unpaid, totaling $${(monthlyTotal._sum.amount ?? 0).toFixed(2)}.`)

  if (overdueBills.length > 0) {
    const lines = overdueBills.map(b =>
      `"${b.name}" — $${b.amount.toFixed(2)} — was due ${formatInTz(new Date(b.nextDueDate), timezone, { day: 'numeric', month: 'short' })}`
    )
    parts.push(`Overdue bills:\n${lines.join('\n')}`)
  }

  if (upcomingBills.length > 0) {
    const lines = upcomingBills.map(b =>
      `"${b.name}" — $${b.amount.toFixed(2)} — due ${formatInTz(new Date(b.nextDueDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`
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
  const timezone = ctx.timezone ?? 'UTC'
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
          ...liveBillWhere,
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
      const thirtyDaysFromNow = nDaysFromTodayInTz(30, timezone)
      bills = await prisma.financeRecurringBill.findMany({
        where: {
          familyId: ctx.familyId,
          isActive: true,
          paid: false,
          nextDueDate: { gte: now, lte: thirtyDaysFromNow },
          ...liveBillWhere,
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
          ...liveBillWhere,
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
        where: { familyId: ctx.familyId, isActive: true, ...liveBillWhere },
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
    const status = b.paid ? `✅ Paid${b.paidDate ? ` ${formatInTz(new Date(b.paidDate), timezone, { day: 'numeric', month: 'short' })}` : ''}` : `⚠️ Due ${formatInTz(new Date(b.nextDueDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`
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
    },
    required: ['billName'],
  },
}

async function markBillPaidHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { billName } = args as { billName: string }
  const lower = billName.toLowerCase()

  // Load full bill records — recordBillPayment needs the whole row.
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: ctx.familyId, isActive: true, paid: false, ...liveBillWhere },
  })

  // Find best match — use let + sequential checks for TypeScript narrowing
  let match = bills.find(b => b.name.toLowerCase().includes(lower))
  if (!match) {
    match = bills.find(b => lower.includes(b.name.toLowerCase()))
  }
  if (!match) {
    return { message: `No unpaid bill found matching "${billName}". Check the name or try "queryBills" to see what's due.` }
  }
  const bill = match

  // Pay the remaining balance — never overpay a partially-paid bill (that would
  // over-clear AP / double the expense). Mirrors the payments POST route.
  const agg = await prisma.financeBillPayment.aggregate({
    where: { billId: bill.id, familyId: ctx.familyId },
    _sum: { amount: true },
  })
  const remaining = bill.amount - (agg._sum.amount ?? 0)
  if (remaining <= 0.005) {
    return { message: `"${bill.name}" is already fully paid.` }
  }

  // No bank GL is known from a chat command → credit Undeposited Funds (suspense),
  // exactly as the payments route does when no account is supplied. AP/AR clears
  // and the trial balance stays balanced; the user allocates the bank later.
  const creditGlAccountId = await ensureUndepositedFundsCategory(ctx.familyId)
  const actualDate = new Date()

  let spawnedInfo: { spawnedBillId: string; spawnedBillDueDate: Date } | null = null
  try {
    const txResult = await prisma.$transaction(async (tx) => {
      return await recordBillPayment(tx, {
        bill,
        amount: remaining,
        actualDate,
        creditGlAccountId,
        usingSuspense: true,
        glAccountId: null,
        paymentAccountId: bill.accountId ?? null,
        notes: null,
        isFullyPaid: true,
        userId: ctx.user.id,
        familyId: ctx.familyId,
      })
    })
    spawnedInfo = txResult.spawned
  } catch (err) {
    console.error('[markBillPaid] payment failed:', err)
    return { message: `Couldn't record the payment for "${bill.name}". No changes were saved.` }
  }

  // Copy the parent bill's draft journal onto a freshly-spawned template-less
  // successor — OUTSIDE the tx (upsertDraftJournal opens its own). Shared with
  // the bills PATCH path so both produce identical successors. Non-fatal.
  if (spawnedInfo && bill.journalEntryId) {
    await copySpawnedBillDraftJournal(
      spawnedInfo.spawnedBillId, bill.journalEntryId, bill.name,
      spawnedInfo.spawnedBillDueDate, ctx.familyId, bill.entityId ?? null,
    )
  }

  return {
    message: `"${bill.name}" marked as paid — $${remaining.toFixed(2)} posted to Undeposited Funds.`,
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
  const timezone = ctx.timezone ?? 'UTC'
  const lower = billName.toLowerCase()

  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: ctx.familyId, isActive: true, ...liveBillWhere },
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

  const dueDate = formatInTz(new Date(match.nextDueDate), timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const endDate = match.endDate ? formatInTz(new Date(match.endDate), timezone, { day: 'numeric', month: 'long', year: 'numeric' }) : 'No end date'
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
