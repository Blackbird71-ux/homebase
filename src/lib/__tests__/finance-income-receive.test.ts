import { describe, it, expect, vi, beforeEach } from 'vitest'

// receiveIncomeStage1 runs inside the caller's $transaction, so we pass a mock
// tx client and assert against its spies. postIncomeAccrualJournal is the shared
// posting helper it delegates to — mocked so we can assert the promote/reuse
// decision without a DB.
vi.mock('@/lib/finance-posting', () => ({
  postIncomeAccrualJournal: vi.fn(),
}))

import { receiveIncomeStage1 } from '@/lib/finance-income-receive'
import { postIncomeAccrualJournal } from '@/lib/finance-posting'

const REMIT_DATE = new Date('2026-05-10T00:00:00Z')

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    name: 'Consulting invoice',
    amount: 500,
    accountId: 'acct-1',
    categoryId: 'gl-income',
    entityId: null,
    vendorId: null,
    notes: null,
    memberId: null,
    locationId: null,
    incomeType: 'recurring',
    journalEntryId: 'draft-je',
    ...overrides,
  } as never
}

function makeTx() {
  return {
    financeJournalEntry: { findFirst: vi.fn() },
    financeTransaction: { create: vi.fn() },
    financeIncomeEntry: { update: vi.fn() },
  }
}

describe('receiveIncomeStage1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(postIncomeAccrualJournal).mockResolvedValue({ journalEntryId: 'posted-je' } as never)
  })

  it('promotes an UNPOSTED draft: posts the accrual, creates the remittance tx, flags invoiceReceived', async () => {
    const tx = makeTx()
    tx.financeJournalEntry.findFirst.mockResolvedValue({ isPosted: false })
    tx.financeTransaction.create.mockResolvedValue({ id: 'tx-1' })

    const result = await receiveIncomeStage1(tx as never, {
      entry: makeEntry(),
      remittanceDate: REMIT_DATE,
      userId: 'user-1',
      familyId: 'fam-1',
    })

    // Promotes the linked draft via the shared poster (not a fresh duplicate).
    expect(postIncomeAccrualJournal).toHaveBeenCalledTimes(1)
    expect(vi.mocked(postIncomeAccrualJournal).mock.calls[0][1]).toMatchObject({
      familyId: 'fam-1',
      incomeGlAccountId: 'gl-income',
      amount: 500,
      draftJournalEntryId: 'draft-je',
    })
    // Remittance transaction recorded.
    expect(tx.financeTransaction.create).toHaveBeenCalledTimes(1)
    // Flags set atomically to the posted journal + remittance tx.
    expect(tx.financeIncomeEntry.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: {
        invoiceReceived: true,
        invoiceReceivedDate: REMIT_DATE,
        invoiceTxId: 'tx-1',
        transactionId: 'tx-1',
        journalEntryId: 'posted-je',
      },
    })
    expect(result).toEqual({ journalEntryId: 'posted-je', invoiceTxId: 'tx-1' })
  })

  it('re-uses an ALREADY-POSTED linked journal instead of posting a duplicate', async () => {
    const tx = makeTx()
    tx.financeJournalEntry.findFirst.mockResolvedValue({ isPosted: true })
    tx.financeTransaction.create.mockResolvedValue({ id: 'tx-2' })

    const result = await receiveIncomeStage1(tx as never, {
      entry: makeEntry(),
      remittanceDate: REMIT_DATE,
      userId: 'user-1',
      familyId: 'fam-1',
    })

    expect(postIncomeAccrualJournal).not.toHaveBeenCalled()
    expect(result.journalEntryId).toBe('draft-je')
    expect(tx.financeIncomeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ journalEntryId: 'draft-je' }) }),
    )
  })

  it('throws when the income entry has no category (cannot post)', async () => {
    const tx = makeTx()
    await expect(
      receiveIncomeStage1(tx as never, {
        entry: makeEntry({ categoryId: null }),
        remittanceDate: REMIT_DATE,
        userId: 'user-1',
        familyId: 'fam-1',
      }),
    ).rejects.toThrow(/must have a category/)
    expect(postIncomeAccrualJournal).not.toHaveBeenCalled()
    expect(tx.financeIncomeEntry.update).not.toHaveBeenCalled()
  })
})
