import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PATCH } from '../route'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    financeJournalEntry: { findFirst: vi.fn(), update: vi.fn() },
    financeJournalLine: { deleteMany: vi.fn() },
    financeCategory: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/finance-period-lock', () => ({ getPeriodLockWarning: vi.fn() }))
// Only used by other PATCH actions; mocked so the module import is inert here.
vi.mock('@/lib/finance-journal-ref', () => ({ nextJournalReference: vi.fn() }))

function patchReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

// A plain posted manual entry — edit-posted is allowed on it, and the test
// proves the audit-graph fields survive an in-place edit untouched.
const existingPosted = {
  id: 'je-1',
  familyId: 'fam-1',
  isPosted: true,
  isReversed: false,
  type: 'manual',
  reversalOfId: null,
  amendmentOfId: null,
  reference: 'JE-0020',
  lines: [],
}

// A posted reversal entry — a member of a reversal/void pair. edit-posted must
// refuse to touch it (editing one leg desyncs the pair from netting to zero).
const existingReversal = {
  ...existingPosted,
  type: 'reversal',
  reversalOfId: 'je-0',
}

const balancedLines = [
  { glAccountId: 'acc-1', side: 'debit',  amount: 100, description: null },
  { glAccountId: 'acc-2', side: 'credit', amount: 100, description: null },
]

describe('PATCH /api/finance/journals — edit-posted action', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    ;(auth as any).mockResolvedValue({ user: { id: 'u1', familyId: 'fam-1' } })
    const { getPeriodLockWarning } = await import('@/lib/finance-period-lock')
    ;(getPeriodLockWarning as any).mockResolvedValue(null)
  })

  it('replaces lines and updates scalars WITHOUT touching audit-graph fields', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue(existingPosted)
    ;(prisma.financeCategory.findMany as any).mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }])
    ;(prisma.financeJournalLine.deleteMany as any).mockReturnValue('DELETE_OP')
    ;(prisma.financeJournalEntry.update as any).mockReturnValue('UPDATE_OP')
    const updated = { id: 'je-1', type: 'manual', isPosted: true }
    ;(prisma.$transaction as any).mockResolvedValue([{ count: 1 }, updated])

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted',
      date: '2026-05-30', description: '  Corrected SGC attribution  ',
      entityId: 'ent-super', lines: balancedLines,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(updated)

    // Old lines wiped, keyed only by the entry id.
    expect(prisma.financeJournalLine.deleteMany).toHaveBeenCalledWith({ where: { journalEntryId: 'je-1' } })

    // The scalar update must carry ONLY date/description/entityId/lines —
    // never the fields that define the entry's place in the audit graph.
    const data = (prisma.financeJournalEntry.update as any).mock.calls[0][0].data
    expect(Object.keys(data).sort()).toEqual(['date', 'description', 'entityId', 'lines'].sort())
    expect(data).not.toHaveProperty('type')
    expect(data).not.toHaveProperty('isPosted')
    expect(data).not.toHaveProperty('isReversed')
    expect(data).not.toHaveProperty('reversalOfId')
    expect(data).not.toHaveProperty('amendmentOfId')
    expect(data).not.toHaveProperty('reference')

    // Scalars applied; description trimmed; new lines created.
    expect(data.date).toEqual(new Date('2026-05-30'))
    expect(data.description).toBe('Corrected SGC attribution')
    expect(data.entityId).toBe('ent-super')
    expect(data.lines.create).toHaveLength(2)
  })

  it('rejects editing an entry that is part of a reversal/void/amendment pair', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue(existingReversal)

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted', date: '2026-05-30', description: 'x', lines: balancedLines,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reversal, void, or amendment pair/i)
    // Blocked before any validation or write touches the GL.
    expect(prisma.financeCategory.findMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.update).not.toHaveBeenCalled()
  })

  it('rejects an unbalanced entry and writes nothing', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue(existingPosted)

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted', date: '2026-05-30', description: 'x',
      lines: [
        { glAccountId: 'acc-1', side: 'debit',  amount: 100 },
        { glAccountId: 'acc-2', side: 'credit', amount:  90 },
      ],
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/debits must equal credits/i)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.update).not.toHaveBeenCalled()
  })

  it('refuses to act on a draft (not posted)', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue({ ...existingPosted, isPosted: false })

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted', date: '2026-05-30', description: 'x', lines: balancedLines,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/posted entries/i)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a GL account that does not belong to the family', async () => {
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue(existingPosted)
    // Two distinct accounts requested, only one found in this family.
    ;(prisma.financeCategory.findMany as any).mockResolvedValue([{ id: 'acc-1' }])

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted', date: '2026-05-30', description: 'x', lines: balancedLines,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/gl accounts not found/i)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('appends the non-blocking period-lock warning when the date is in a locked period', async () => {
    const { prisma } = await import('@/lib/prisma')
    const { getPeriodLockWarning } = await import('@/lib/finance-period-lock')
    ;(prisma.financeJournalEntry.findFirst as any).mockResolvedValue(existingPosted)
    ;(prisma.financeCategory.findMany as any).mockResolvedValue([{ id: 'acc-1' }, { id: 'acc-2' }])
    ;(prisma.financeJournalLine.deleteMany as any).mockReturnValue('DELETE_OP')
    ;(prisma.financeJournalEntry.update as any).mockReturnValue('UPDATE_OP')
    ;(prisma.$transaction as any).mockResolvedValue([{ count: 1 }, { id: 'je-1' }])
    ;(getPeriodLockWarning as any).mockResolvedValue('This date is in a closed period.')

    const res = await PATCH(patchReq({
      id: 'je-1', action: 'edit-posted', date: '2026-05-30', description: 'x', entityId: '', lines: balancedLines,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.periodWarning).toBe('This date is in a closed period.')
    // Empty entityId is normalised to null (household-level entry).
    const data = (prisma.financeJournalEntry.update as any).mock.calls[0][0].data
    expect(data.entityId).toBeNull()
  })
})
