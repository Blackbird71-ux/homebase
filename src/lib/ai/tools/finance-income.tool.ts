// src/lib/ai/tools/finance-income.tool.ts
// AI tool registrations for income tracking.
// Provides: queryIncome, markIncomeReceived

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function incomeContextProvider(familyId: string, _userId: string): Promise<string> {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [activeIncome, upcomingIncome, monthTotal] = await Promise.all([
    prisma.financeIncomeEntry.count({ where: { familyId, isActive: true } }),
    prisma.financeIncomeEntry.findMany({
      where: {
        familyId,
        isActive: true,
        received: false,
        nextExpectedDate: { gte: now, lte: thirtyDaysFromNow },
      },
      select: { name: true, amount: true, nextExpectedDate: true },
      orderBy: { nextExpectedDate: 'asc' },
    }),
    prisma.financeIncomeEntry.aggregate({
      where: { familyId, isActive: true, received: false },
      _sum: { amount: true },
    }),
  ])

  if (activeIncome === 0) return ''

  const lines = upcomingIncome.map(i =>
    `"${i.name}" — $${i.amount.toFixed(2)} expected ${new Date(i.nextExpectedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  )

  const parts = [`You have ${activeIncome} active income source(s).`]
  if (lines.length > 0) {
    parts.push(`Upcoming income (next 30 days):\n${lines.join('\n')}`)
  }
  const total = monthTotal._sum.amount ?? 0
  if (total > 0) {
    parts.push(`Pending income total: $${total.toFixed(2)}`)
  }

  return `Income summary:\n${parts.join('\n\n')}`
}

// ── queryIncome ───────────────────────────────────────────────────────────────

const queryIncomeDefinition: FunctionDeclaration = {
  name: 'queryIncome',
  description: 'Look up income sources, expected amounts, and upcoming pay dates. Use when the user asks "what income is coming up?", "when do I get paid next?", "show my expected income", or "what are my income sources?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      filter: {
        type: SchemaType.STRING,
        description: 'Optional filter: "upcoming" (default) for expected income, "received" for income already received, "all" for everything',
      },
    },
  },
}

async function queryIncomeHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { filter } = args as { filter?: string }
  const now = new Date()

  let whereReceived: boolean | undefined
  let label: string

  switch (filter) {
    case 'received':
      whereReceived = true
      label = 'Received income'
      break
    case 'all':
      whereReceived = undefined
      label = 'All income entries'
      break
    case 'upcoming':
    default:
      whereReceived = false
      label = 'Upcoming income'
      break
  }

  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      ...(whereReceived !== undefined ? { received: whereReceived } : {}),
    },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { nextExpectedDate: 'asc' },
  })

  if (entries.length === 0) {
    return { message: `No ${filter === 'all' ? '' : (filter === 'received' ? 'received ' : 'upcoming ')}income found.` }
  }

  const lines = entries.map(e => {
    const dateStr = e.received
      ? `✅ Received${e.receivedDate ? ` ${new Date(e.receivedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}`
      : `📅 Expected ${new Date(e.nextExpectedDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    const accountStr = e.account ? ` → ${e.account.name}` : ''
    const freqStr = e.frequency !== 'one-off' ? ` (${e.frequency})` : ''
    return `  • ${e.name} — $${e.amount.toFixed(2)}${freqStr} — ${dateStr}${accountStr}`
  })

  const total = entries.reduce((s, e) => s + e.amount, 0)
  const pendingCount = entries.filter(e => !e.received).length
  const pendingTotal = entries.filter(e => !e.received).reduce((s, e) => s + e.amount, 0)

  let summaryStr = `\n\nTotal: $${total.toFixed(2)}`
  if (pendingCount > 0) {
    summaryStr += ` (${pendingCount} pending: $${pendingTotal.toFixed(2)})`
  }

  return { message: `**${label}**\n${lines.join('\n')}${summaryStr}` }
}

// ── markIncomeReceived ─────────────────────────────────────────────────────────

const markIncomeReceivedDefinition: FunctionDeclaration = {
  name: 'markIncomeReceived',
  description: 'Mark an income entry as received. Use when the user says "I got paid", "my salary came in", "received the rental payment", or "mark the invoice as received".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      incomeName: {
        type: SchemaType.STRING,
        description: 'The name (or partial name) of the income entry to mark as received',
      },
    },
    required: ['incomeName'],
  },
}

async function markIncomeReceivedHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { incomeName } = args as { incomeName: string }
  const lower = incomeName.toLowerCase()

  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: ctx.familyId, isActive: true, received: false },
    select: { id: true, name: true, amount: true },
  })

  // Find best match with sequential narrowing
  let match = entries.find(e => e.name.toLowerCase().includes(lower))
  if (!match) {
    match = entries.find(e => lower.includes(e.name.toLowerCase()))
  }
  if (!match) {
    return { message: `No pending income entry matching "${incomeName}".` }
  }

  await prisma.financeIncomeEntry.update({
    where: { id: match.id },
    data: { received: true, receivedDate: new Date() },
  })

  return {
    message: `"${match.name}" — $${match.amount.toFixed(2)} marked as received.`,
    action: 'markIncomeReceived',
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerFinanceIncomeTools(): void {
  registerTool('queryIncome', {
    definition: queryIncomeDefinition,
    contextProvider: incomeContextProvider,
    handler: queryIncomeHandler,
  })

  registerTool('markIncomeReceived', {
    definition: markIncomeReceivedDefinition,
    handler: markIncomeReceivedHandler,
    actionEvents: { markIncomeReceived: 'app:financeUpdated' },
  })
}
