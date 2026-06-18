// src/lib/ai/tools/finance-income.tool.ts
// AI tool registrations for income tracking.
// Provides: queryIncome, markIncomeReceived

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz, nDaysFromTodayInTz } from '@/lib/timezone'
import { ensureUndepositedFundsCategory } from '@/lib/finance-opening-balance'
import { postIncomeAccrualJournal, postIncomeReceiptJournal } from '@/lib/finance-posting'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'
import { liveIncomeWhere } from '@/lib/finance-live-filter'

// ── Context provider ──────────────────────────────────────────────────────────

async function incomeContextProvider(familyId: string, _userId: string, timezone: string): Promise<string> {
  const now = new Date()
  const thirtyDaysFromNow = nDaysFromTodayInTz(30, timezone)

  const [activeIncome, upcomingIncome, monthTotal] = await Promise.all([
    prisma.financeIncomeEntry.count({ where: { familyId, isActive: true, ...liveIncomeWhere } }),
    prisma.financeIncomeEntry.findMany({
      where: {
        familyId,
        isActive: true,
        received: false,
        nextExpectedDate: { gte: now, lte: thirtyDaysFromNow },
        ...liveIncomeWhere,
      },
      select: { name: true, amount: true, nextExpectedDate: true },
      orderBy: { nextExpectedDate: 'asc' },
    }),
    prisma.financeIncomeEntry.aggregate({
      where: { familyId, isActive: true, received: false, ...liveIncomeWhere },
      _sum: { amount: true },
    }),
  ])

  if (activeIncome === 0) return ''

  const lines = upcomingIncome.map(i =>
    `"${i.name}" — $${i.amount.toFixed(2)} expected ${formatInTz(new Date(i.nextExpectedDate), timezone, { day: 'numeric', month: 'short' })}`
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
  const timezone = ctx.timezone ?? 'UTC'
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
      ...liveIncomeWhere,
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
      ? `✅ Received${e.receivedDate ? ` ${formatInTz(new Date(e.receivedDate), timezone, { day: 'numeric', month: 'short' })}` : ''}`
      : `📅 Expected ${formatInTz(new Date(e.nextExpectedDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`
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
    where: { familyId: ctx.familyId, isActive: true, received: false, ...liveIncomeWhere },
    select: { id: true, name: true, amount: true, categoryId: true, entityId: true, invoiceReceived: true },
  })

  // Find best match with sequential narrowing
  let match = entries.find(e => e.name.toLowerCase().includes(lower))
  if (!match) {
    match = entries.find(e => lower.includes(e.name.toLowerCase()))
  }
  if (!match) {
    return { message: `No pending income entry matching "${incomeName}".` }
  }
  const entry = match

  // No bank GL is known from a chat command → debit Undeposited Funds (suspense),
  // mirroring the bills path. The receipt journal (DR Undeposited Funds / CR AR)
  // clears AR; the user allocates the real bank account later.
  const undepositedGl = await ensureUndepositedFundsCategory(ctx.familyId)
  const receivedDate = new Date()
  const amount = entry.amount

  try {
    if (entry.invoiceReceived) {
      // Already accrued (Stage 1 DR AR / CR Income posted) → post the receipt only.
      await prisma.$transaction(async (tx) => {
        const receipt = await postIncomeReceiptJournal(tx, {
          familyId: ctx.familyId,
          description: entry.name,
          amount,
          bankGlAccountId: undepositedGl,
          entityId: entry.entityId ?? null,
          date: receivedDate,
        })
        await tx.financeIncomeEntry.update({
          where: { id: entry.id },
          data: {
            received: true,
            receivedDate,
            receiptJournalEntryId: receipt.journalEntryId,
            actualAmountReceived: amount,
            status: 'received',
          },
        })
      })
    } else {
      // Not yet accrued → post Stage 1 (DR AR / CR Income) then Stage 2 receipt in
      // one transaction. Needs an income category for the credit side.
      const incomeGlAccountId = entry.categoryId
      if (!incomeGlAccountId) {
        return { message: `"${entry.name}" has no income category set — open it in Finance → Income and choose a category before marking it received.` }
      }
      await prisma.$transaction(async (tx) => {
        const accrual = await postIncomeAccrualJournal(tx, {
          familyId: ctx.familyId,
          description: entry.name,
          amount,
          incomeGlAccountId,
          entityId: entry.entityId ?? null,
          date: receivedDate,
        })
        // Force the receipt reference to accrual+1 — nextJournalReference reads the
        // committed DB state and cannot see the accrual written earlier in this same
        // transaction, so letting it self-generate would collide (P2002).
        const base = parseInt(accrual.reference.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
        const receiptRef = `JE-${String(base + 1).padStart(4, '0')}`
        const receipt = await postIncomeReceiptJournal(tx, {
          familyId: ctx.familyId,
          description: entry.name,
          amount,
          bankGlAccountId: undepositedGl,
          entityId: entry.entityId ?? null,
          date: receivedDate,
          reference: receiptRef,
        })
        await tx.financeIncomeEntry.update({
          where: { id: entry.id },
          data: {
            invoiceReceived: true,
            invoiceReceivedDate: receivedDate,
            journalEntryId: accrual.journalEntryId,
            received: true,
            receivedDate,
            receiptJournalEntryId: receipt.journalEntryId,
            actualAmountReceived: amount,
            status: 'received',
          },
        })
      })
    }
  } catch (err) {
    console.error('[markIncomeReceived] receipt failed:', err)
    return { message: `Couldn't record the receipt for "${entry.name}". No changes were saved.` }
  }

  return {
    message: `"${entry.name}" — $${amount.toFixed(2)} marked as received (posted to Undeposited Funds).`,
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
