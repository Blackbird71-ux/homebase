import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    financeTransaction: { findMany: vi.fn(), count: vi.fn() },
    financeJournalEntry: { findMany: vi.fn() },
    family: { findUnique: vi.fn() },
  },
}))

function req(qs = ''): NextRequest {
  return { url: `http://localhost/api/finance/transactions${qs}` } as unknown as NextRequest
}

describe('GET /api/finance/transactions — hasPostedPnlJournal flag', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    ;(auth as any).mockResolvedValue({ user: { id: 'u1', familyId: 'fam-1' } })
  })

  it('flags only transactions with a live posted P&L journal, so the P&L screen does not double-count', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeTransaction.findMany as any).mockResolvedValue([
      { id: 'tx-A', amount: 24.35, type: 'expense' },
      { id: 'tx-B', amount: 50, type: 'expense' },
    ])
    ;(prisma.financeTransaction.count as any).mockResolvedValue(2)
    // Only tx-A has a live (posted, non-reversed) income/expense journal.
    ;(prisma.financeJournalEntry.findMany as any).mockResolvedValue([
      { sourceTransactionId: 'tx-A' },
    ])

    const res = await GET(req())
    const body = await res.json()

    const byId = Object.fromEntries(body.transactions.map((t: any) => [t.id, t.hasPostedPnlJournal]))
    expect(byId['tx-A']).toBe(true)
    expect(byId['tx-B']).toBe(false)

    // Pin the exact dedup predicate: live (posted, non-reversed) journal whose
    // lines touch an income/expense GL account. Loosening any clause would
    // reintroduce the on-screen-P&L double-count.
    const where = (prisma.financeJournalEntry.findMany as any).mock.calls[0][0].where
    expect(where.sourceTransactionId).toEqual({ in: ['tx-A', 'tx-B'] })
    expect(where.isPosted).toBe(true)
    expect(where.isReversed).toBe(false)
    expect(where.lines).toEqual({ some: { glAccount: { type: { in: ['income', 'expense'] } } } })
  })

  it('skips the journal lookup entirely when there are no transactions', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeTransaction.findMany as any).mockResolvedValue([])
    ;(prisma.financeTransaction.count as any).mockResolvedValue(0)

    const res = await GET(req())
    const body = await res.json()

    expect(body.transactions).toEqual([])
    expect(prisma.financeJournalEntry.findMany).not.toHaveBeenCalled()
  })
})
