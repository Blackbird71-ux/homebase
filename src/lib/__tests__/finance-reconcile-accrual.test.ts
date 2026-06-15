import { describe, it, expect, vi, beforeEach } from 'vitest'

// reconcilePostedAccrualOnEdit manages its own $transaction via the global prisma
// client. The mock makes $transaction invoke its callback with the prisma mock
// itself as `tx`, so tx.financeJournalEntry.* resolves to the same spies we assert on.
vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {}
  Object.assign(prisma, {
    financeCategory: { findMany: vi.fn() },
    financeJournalEntry: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    financeTransaction: { update: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  })
  return { prisma }
})
vi.mock('@/lib/finance-journal-ref', () => ({ nextJournalReference: vi.fn() }))
vi.mock('@/lib/finance-opening-balance', () => ({
  ensureAccountsPayableCategory: vi.fn(),
  ensureAccountsReceivableCategory: vi.fn(),
}))

import {
  reconcilePostedAccrualOnEdit,
  AccrualReconcileBlockedError,
} from '@/lib/finance-posting'

const ACCRUAL_DATE = new Date('2026-05-30T09:10:33.409Z')

// A posted, 2-line bill accrual: DR <some account> / CR AP.
const postedBillAccrual = () => ({
  id: 'je-old',
  reference: 'JE-0022',
  description: 'Apco Bendigo Fuel',
  isPosted: true,
  isReversed: false,
  entityId: null as string | null,
  date: ACCRUAL_DATE,
  lines: [
    { glAccountId: 'gl-visa', side: 'debit', amount: 74.18, description: 'Apco Bendigo Fuel' },
    { glAccountId: 'gl-ap', side: 'credit', amount: 74.18, description: 'AP: Apco Bendigo Fuel' },
  ],
})

async function getMocks() {
  const { prisma } = await import('@/lib/prisma')
  const { nextJournalReference } = await import('@/lib/finance-journal-ref')
  const { ensureAccountsPayableCategory, ensureAccountsReceivableCategory } = await import('@/lib/finance-opening-balance')
  return { prisma, nextJournalReference, ensureAccountsPayableCategory, ensureAccountsReceivableCategory }
}

describe('reconcilePostedAccrualOnEdit', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { prisma, nextJournalReference, ensureAccountsPayableCategory, ensureAccountsReceivableCategory } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue(postedBillAccrual() as never)
    vi.mocked(prisma.financeJournalEntry.create).mockResolvedValue({ id: 'je-new' } as never)
    vi.mocked(prisma.financeJournalEntry.update).mockResolvedValue({ id: 'je-old' } as never)
    vi.mocked(prisma.financeTransaction.update).mockResolvedValue({ id: 'tx-1' } as never)
    // Echo back the requested ids so assertGlAccountsBelongToFamily sees every
    // referenced account as valid (mirrors a real findMany({ id: { in } }) query).
    vi.mocked(prisma.financeCategory.findMany).mockImplementation((async (args: { where?: { id?: { in?: string[] } } }) => {
      const ids = args?.where?.id?.in ?? []
      return ids.map((id) => ({ id }))
    }) as never)
    vi.mocked(nextJournalReference).mockResolvedValue('JE-0030')
    vi.mocked(ensureAccountsPayableCategory).mockResolvedValue('gl-ap' as never)
    vi.mocked(ensureAccountsReceivableCategory).mockResolvedValue('gl-ar' as never)
  })

  it('bill: reverses the stale accrual and posts a fresh DR newExpense / CR AP, re-syncing the invoice tx', async () => {
    const { prisma } = await getMocks()
    const res = await reconcilePostedAccrualOnEdit({
      kind: 'bill',
      familyId: 'fam-1',
      journalEntryId: 'je-old',
      description: 'Apco Bendigo Fuel',
      amount: 74.18,
      glAccountId: 'gl-newexp',
      entityId: 'ent-1',
      invoiceTxId: 'tx-1',
    })

    expect(res).toEqual({ newJournalEntryId: 'je-new' })

    // create called twice: [0] = reversal, [1] = fresh accrual
    const createCalls = vi.mocked(prisma.financeJournalEntry.create).mock.calls
    expect(createCalls).toHaveLength(2)

    // Reversal: flipped lines, reversalOfId set, pre-computed ref, original date.
    const reversal = createCalls[0][0] as { data: Record<string, unknown> }
    expect(reversal.data.reference).toBe('JE-0030')
    expect(reversal.data.type).toBe('reversal')
    expect(reversal.data.reversalOfId).toBe('je-old')
    expect(reversal.data.isPosted).toBe(true)
    expect(reversal.data.date).toBe(ACCRUAL_DATE)
    expect((reversal.data.lines as { create: unknown[] }).create).toEqual([
      { glAccountId: 'gl-visa', side: 'credit', amount: 74.18, description: 'Apco Bendigo Fuel' },
      { glAccountId: 'gl-ap', side: 'debit', amount: 74.18, description: 'AP: Apco Bendigo Fuel' },
    ])

    // Original marked reversed.
    expect(prisma.financeJournalEntry.update).toHaveBeenCalledWith({ where: { id: 'je-old' }, data: { isReversed: true } })

    // Fresh accrual: DR newExpense / CR AP, next ref, original date.
    const fresh = createCalls[1][0] as { data: Record<string, unknown> }
    expect(fresh.data.reference).toBe('JE-0031')
    expect(fresh.data.type).toBe('auto_transaction')
    expect(fresh.data.isPosted).toBe(true)
    expect(fresh.data.entityId).toBe('ent-1')
    expect(fresh.data.date).toBe(ACCRUAL_DATE)
    expect((fresh.data.lines as { create: unknown[] }).create).toEqual([
      { glAccountId: 'gl-newexp', side: 'debit', amount: 74.18, description: 'Apco Bendigo Fuel', memberId: null },
      { glAccountId: 'gl-ap', side: 'credit', amount: 74.18, description: 'AP: Apco Bendigo Fuel', memberId: null },
    ])

    // Linked invoice transaction re-pointed to the new economics.
    expect(prisma.financeTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { categoryId: 'gl-newexp', entityId: 'ent-1', amount: 74.18 },
    })
  })

  it('income: posts a fresh DR AR / CR newIncome', async () => {
    const { prisma } = await getMocks()
    // Posted income accrual is DR AR / CR Income.
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({
      ...postedBillAccrual(),
      lines: [
        { glAccountId: 'gl-ar', side: 'debit', amount: 200, description: 'AR: Salary' },
        { glAccountId: 'gl-oldincome', side: 'credit', amount: 200, description: 'Salary' },
      ],
    } as never)

    const res = await reconcilePostedAccrualOnEdit({
      kind: 'income',
      familyId: 'fam-1',
      journalEntryId: 'je-old',
      description: 'Salary',
      amount: 200,
      glAccountId: 'gl-income',
      entityId: null,
      invoiceTxId: null,
    })

    expect(res).toEqual({ newJournalEntryId: 'je-new' })
    const fresh = (vi.mocked(prisma.financeJournalEntry.create).mock.calls[1][0]) as { data: Record<string, unknown> }
    expect((fresh.data.lines as { create: unknown[] }).create).toEqual([
      { glAccountId: 'gl-ar', side: 'debit', amount: 200, description: 'AR: Salary', memberId: null },
      { glAccountId: 'gl-income', side: 'credit', amount: 200, description: 'Salary', memberId: null },
    ])
    // No invoice tx to re-sync.
    expect(prisma.financeTransaction.update).not.toHaveBeenCalled()
  })

  it('carries per-member attribution from the stale accrual onto the fresh lines', async () => {
    const { prisma } = await getMocks()
    // A member-attributed posted accrual: memberId rides on the source lines.
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({
      ...postedBillAccrual(),
      lines: [
        { glAccountId: 'gl-visa', side: 'debit', amount: 74.18, description: 'Apco Bendigo Fuel', memberId: 'mem-x' },
        { glAccountId: 'gl-ap', side: 'credit', amount: 74.18, description: 'AP: Apco Bendigo Fuel', memberId: 'mem-x' },
      ],
    } as never)

    await reconcilePostedAccrualOnEdit({
      kind: 'bill',
      familyId: 'fam-1',
      journalEntryId: 'je-old',
      description: 'Apco Bendigo Fuel',
      amount: 74.18,
      glAccountId: 'gl-newexp',
      entityId: 'ent-1',
      invoiceTxId: 'tx-1',
    })

    const fresh = (vi.mocked(prisma.financeJournalEntry.create).mock.calls[1][0]) as { data: Record<string, unknown> }
    expect((fresh.data.lines as { create: unknown[] }).create).toEqual([
      { glAccountId: 'gl-newexp', side: 'debit', amount: 74.18, description: 'Apco Bendigo Fuel', memberId: 'mem-x' },
      { glAccountId: 'gl-ap', side: 'credit', amount: 74.18, description: 'AP: Apco Bendigo Fuel', memberId: 'mem-x' },
    ])
  })

  it('blocks a custom split (more than 2 lines) and writes nothing', async () => {
    const { prisma } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({
      ...postedBillAccrual(),
      lines: [
        { glAccountId: 'gl-exp', side: 'debit', amount: 67.44, description: 'ex-GST' },
        { glAccountId: 'gl-gst', side: 'debit', amount: 6.74, description: 'GST ITC' },
        { glAccountId: 'gl-ap', side: 'credit', amount: 74.18, description: 'AP' },
      ],
    } as never)

    await expect(
      reconcilePostedAccrualOnEdit({
        kind: 'bill', familyId: 'fam-1', journalEntryId: 'je-old',
        description: 'X', amount: 74.18, glAccountId: 'gl-newexp', entityId: null,
      }),
    ).rejects.toBeInstanceOf(AccrualReconcileBlockedError)

    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
    expect(prisma.financeJournalEntry.update).not.toHaveBeenCalled()
  })

  it('is a no-op when the linked entry is not posted', async () => {
    const { prisma } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({ ...postedBillAccrual(), isPosted: false } as never)

    const res = await reconcilePostedAccrualOnEdit({
      kind: 'bill', familyId: 'fam-1', journalEntryId: 'je-old',
      description: 'X', amount: 74.18, glAccountId: 'gl-newexp', entityId: null,
    })

    expect(res).toEqual({ newJournalEntryId: 'je-old' })
    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
  })

  it('is a no-op when the linked entry is already reversed', async () => {
    const { prisma } = await getMocks()
    vi.mocked(prisma.financeJournalEntry.findFirst).mockResolvedValue({ ...postedBillAccrual(), isReversed: true } as never)

    const res = await reconcilePostedAccrualOnEdit({
      kind: 'bill', familyId: 'fam-1', journalEntryId: 'je-old',
      description: 'X', amount: 74.18, glAccountId: 'gl-newexp', entityId: null,
    })

    expect(res).toEqual({ newJournalEntryId: 'je-old' })
    expect(prisma.financeJournalEntry.create).not.toHaveBeenCalled()
  })

  it('throws on a non-positive amount before any DB read', async () => {
    const { prisma } = await getMocks()
    await expect(
      reconcilePostedAccrualOnEdit({
        kind: 'bill', familyId: 'fam-1', journalEntryId: 'je-old',
        description: 'X', amount: 0, glAccountId: 'gl-newexp', entityId: null,
      }),
    ).rejects.toThrow(/amount must be positive/)
    expect(prisma.financeJournalEntry.findFirst).not.toHaveBeenCalled()
  })
})
