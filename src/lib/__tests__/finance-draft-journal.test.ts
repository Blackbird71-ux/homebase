import { describe, it, expect, vi, beforeEach } from 'vitest'

// finance-posting.ts manages its own $transaction via the global prisma client.
// The mock makes $transaction invoke its callback with the prisma mock itself as
// `tx`, so tx.financeJournalEntry.* resolves to the same spies we assert on.
vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {}
  Object.assign(prisma, {
    financeCategory: { findMany: vi.fn() },
    financeJournalLine: { deleteMany: vi.fn() },
    financeJournalEntry: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  })
  return { prisma }
})
vi.mock('@/lib/finance-journal-ref', () => ({ nextJournalReference: vi.fn() }))
vi.mock('@/lib/finance-opening-balance', () => ({
  ensureAccountsPayableCategory: vi.fn(),
  ensureAccountsReceivableCategory: vi.fn(),
}))

import { upsertDraftJournal } from '@/lib/finance-posting'

const DATE = new Date('2026-05-01T00:00:00Z')

// Balanced DR 100 / CR 100 across two GL accounts.
const balancedLines = () => [
  { glAccountId: 'gl-exp', side: 'debit' as const, amount: 100 },
  { glAccountId: 'gl-ap', side: 'credit' as const, amount: 100 },
]

const base = {
  existingJournalEntryId: null as string | null,
  lines: balancedLines(),
  date: DATE,
  familyId: 'fam-1',
  entityId: null as string | null,
}

async function getMocks() {
  const { prisma } = await import('@/lib/prisma')
  const { nextJournalReference } = await import('@/lib/finance-journal-ref')
  return { prisma, nextJournalReference }
}

describe('upsertDraftJournal', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { prisma, nextJournalReference } = await getMocks()
    // Default: GL accounts all valid, references generated, create returns an id.
    vi.mocked(prisma.financeCategory.findMany).mockResolvedValue([{ id: 'gl-exp' }, { id: 'gl-ap' }] as never)
    vi.mocked(nextJournalReference).mockResolvedValue('JE-0001')
    vi.mocked(prisma.financeJournalEntry.create).mockResolvedValue({ id: 'je-new' } as never)
    vi.mocked(prisma.financeJournalEntry.update).mockResolvedValue({ id: 'je-1' } as never)
  })

  it('creates a NEW unposted draft for the bill path (isPosted=false)', async () => {
    const { prisma } = await getMocks()
    const id = await upsertDraftJournal({ ...base, description: 'Test Bill', isPosted: false })

    expect(id).toBe('je-new')
    expect(prisma.financeJournalEntry.findFirst).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.create).toHaveBeenCalledWith({
      data: {
        reference: 'JE-0001',
        date: DATE,
        description: 'Test Bill',
        type: 'auto_transaction',
        isPosted: false,
        entityId: null,
        familyId: 'fam-1',
        lines: {
          create: [
            { glAccountId: 'gl-exp', side: 'debit', amount: 100, description: null },
            { glAccountId: 'gl-ap', side: 'credit', amount: 100, description: null },
          ],
        },
      },
      select: { id: true },
    })
  })

  it('creates a NEW posted entry for the income path (isPosted=true)', async () => {
    const { prisma } = await getMocks()
    const id = await upsertDraftJournal({ ...base, description: 'Test Income', isPosted: true })

    expect(id).toBe('je-new')
    const arg = vi.mocked(prisma.financeJournalEntry.create).mock.calls[0][0] as { data: { isPosted: boolean; description: string } }
    expect(arg.data.isPosted).toBe(true)
    expect(arg.data.description).toBe('Test Income')
  })

  it('updates an EXISTING unposted draft atomically (deleteMany + update), preserving isPosted', async () => {
    const { prisma } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({ id: 'je-1', isPosted: false } as never)

    const id = await upsertDraftJournal({
      ...base,
      existingJournalEntryId: 'je-1',
      description: 'Edited Income',
      isPosted: true,
    })

    expect(id).toBe('je-1')
    expect(prisma.financeJournalLine.deleteMany).toHaveBeenCalledWith({ where: { journalEntryId: 'je-1' } })
    expect(prisma.financeJournalEntry.update).toHaveBeenCalledWith({
      where: { id: 'je-1' },
      data: {
        date: DATE,
        description: 'Edited Income',
        entityId: null,
        isPosted: true,
        lines: {
          create: [
            { glAccountId: 'gl-exp', side: 'debit', amount: 100, description: null },
            { glAccountId: 'gl-ap', side: 'credit', amount: 100, description: null },
          ],
        },
      },
    })
    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
  })

  it('refuses to modify a POSTED entry in place (reversal guard)', async () => {
    const { prisma } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({ id: 'je-1', isPosted: true } as never)

    await expect(
      upsertDraftJournal({ ...base, existingJournalEntryId: 'je-1', description: 'X', isPosted: false }),
    ).rejects.toThrow(/posted journal entry in place/)

    expect(prisma.financeJournalLine.deleteMany).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.update).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
  })

  it('throws on unbalanced lines and writes nothing', async () => {
    const { prisma } = await getMocks()
    const lines = [
      { glAccountId: 'gl-exp', side: 'debit' as const, amount: 100 },
      { glAccountId: 'gl-ap', side: 'credit' as const, amount: 90 },
    ]
    await expect(
      upsertDraftJournal({ ...base, lines, description: 'X', isPosted: false }),
    ).rejects.toThrow(/not balanced/)

    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.update).not.toHaveBeenCalled()
  })

  it('throws when fewer than 2 lines (before any GL lookup)', async () => {
    const { prisma } = await getMocks()
    const lines = [{ glAccountId: 'gl-exp', side: 'debit' as const, amount: 100 }]
    await expect(
      upsertDraftJournal({ ...base, lines, description: 'X', isPosted: false }),
    ).rejects.toThrow(/at least 2 lines/)

    expect(prisma.financeCategory.findMany).not.toHaveBeenCalled()
  })

  it('throws the terse "GL accounts not found" message when an account is invalid', async () => {
    const { prisma } = await getMocks()
    // Only one of the two referenced accounts resolves.
    vi.mocked(prisma.financeCategory.findMany).mockResolvedValue([{ id: 'gl-exp' }] as never)

    await expect(
      upsertDraftJournal({ ...base, description: 'X', isPosted: false }),
    ).rejects.toThrow('One or more GL accounts not found')

    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
  })
})
