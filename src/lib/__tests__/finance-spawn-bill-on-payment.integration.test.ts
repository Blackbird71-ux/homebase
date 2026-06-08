/**
 * Spawn-helper consolidation QA gate — `spawnNextBillOnPayment` +
 * `copySpawnedBillDraftJournal` exercised against a WRITABLE COPY of the real
 * SQLite database, then checked with the read-only integrity audit.
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated.
 * This test copies it to a throwaway temp file and points prisma at the copy via
 * DATABASE_URL, so nothing here can touch the live file. It self-skips when
 * data/homebase.db is absent (CI / other machines). Run locally:
 *   `npx vitest run finance-spawn-bill-on-payment`
 *
 * Context: the on-payment bill spawn used to be TWO divergent inline copies (the
 * bills PATCH "Mark Paid" handler vs the payments/AI path) which produced
 * DIFFERENT successors for the same bill — most dangerously a different
 * nextDueDate (one stepped strictly from the bill's own due date, the other
 * "jumped past today" for overdue bills). They are now ONE shared pair. These
 * tests lock the surviving contract:
 *
 *   1. A fully-paid template-less recurring bill spawns EXACTLY ONE successor,
 *      status='draft', templateId=null, parentBillId=the paid bill.
 *   2. The successor's nextDueDate is STRICT-NEXT — exactly one period after the
 *      bill's own nextDueDate — even when the bill is months overdue (the retired
 *      "overdue jump" would have landed it near today instead). Seeding an overdue
 *      bill is what makes this assertion decisive.
 *   3. copySpawnedBillDraftJournal copies the parent's custom split onto the
 *      successor as an UNPOSTED draft journal, lines preserved.
 *   4. The integrity audit gains NO new critical/warning findings and the trial
 *      balance still balances after the spawn.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(__dirname, '..', '..', '..')
const LIVE_DB = path.join(REPO, 'data', 'homebase.db')
const FAMILY = 'cmo3yb55h000001ldlk4w6p37' // "The Liddles"
// AP / AR control accounts — avoid them so the synthetic entry can't disturb the
// AP/AR-control-vs-subledger reconciliation checks.
const CONTROL_ACCOUNT_IDS = new Set([
  'cmozfz2uq000c01miyi36avpc', // Accounts Payable
  'cmozfyqwo000b01mio4knh0kc', // Accounts Receivable
  'cmp4y099e000h01nnzjzkgy76', // Accounts Receivable (deprecated)
])

// Overdue monthly bill due on the 15th → strict-next successor is the 15th of the
// following month. Today (per the project clock) is 2026-06-08, so Jan 15 is ~5
// months overdue: strict-next = Feb 15; the retired overdue-jump would have given
// ~Jul. Asserting Feb 15 proves the consolidation kept strict-next cadence.
const SEED_DUE = Date.UTC(2026, 0, 15)        // 2026-01-15T00:00:00Z (overdue)
const EXPECT_NEXT = Date.UTC(2026, 1, 15)     // 2026-02-15T00:00:00Z (strict-next)

const haveDb = fs.existsSync(LIVE_DB)
const d = haveDb ? describe : describe.skip

d('spawnNextBillOnPayment / copySpawnedBillDraftJournal against a writable DB copy', () => {
  let tmpDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spawnNextBillOnPayment: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let copySpawnedBillDraftJournal: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runFinanceIntegrityAudit: any

  let baseline: { critical: number; warning: number }
  let glA: string
  let glB: string
  let glC: string | undefined

  // Shared across the ordered tests
  let parentBillId: string
  let parentJournalId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parentLines: any[]
  let spawnedBillId: string
  let spawnedDueDate: Date

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-spawn-'))
    const copy = path.join(tmpDir, 'homebase.db')
    fs.copyFileSync(LIVE_DB, copy)
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(LIVE_DB + ext)) fs.copyFileSync(LIVE_DB + ext, copy + ext)
    }
    // Bind prisma to the COPY before the prisma module is first evaluated.
    process.env.DATABASE_URL = `file:${copy}`

    ;({ prisma } = await import('../prisma'))
    ;({ spawnNextBillOnPayment, copySpawnedBillDraftJournal } = await import('../finance-draft-spawn-service'))
    ;({ runFinanceIntegrityAudit } = await import('../finance-integrity'))

    const before = await runFinanceIntegrityAudit(FAMILY)
    baseline = { critical: before.summary.critical, warning: before.summary.warning }

    // Real, non-control GL accounts already in this family's posted ledger
    // (guarantees the Restrict FK on FinanceJournalLine.glAccountId + same family).
    const distinctAccts = await prisma.financeJournalLine.findMany({
      where: { journalEntry: { familyId: FAMILY, isPosted: true } },
      select: { glAccountId: true },
      distinct: ['glAccountId'],
      take: 20,
    })
    const usable = distinctAccts
      .map((l: { glAccountId: string }) => l.glAccountId)
      .filter((id: string) => !CONTROL_ACCOUNT_IDS.has(id))
    glA = usable[0]
    glB = usable[1]
    glC = usable[2]
  }, 60_000)

  afterAll(async () => {
    await prisma?.$disconnect?.()
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('connects to the copy and the family has a posted ledger', async () => {
    expect(haveDb).toBe(true)
    const posted = await prisma.financeJournalEntry.count({
      where: { familyId: FAMILY, isPosted: true },
    })
    expect(posted).toBeGreaterThan(0)
    expect(glA).toBeTruthy()
    expect(glB).toBeTruthy()
    expect(glA).not.toBe(glB)
    // Per project memory the live ledger is clean — no critical divergences.
    expect(baseline.critical).toBe(0)
  })

  it('spawns exactly one strict-next draft successor for an overdue template-less bill', async () => {
    // A custom-split (≥2 line) UNPOSTED draft journal on the parent — what
    // copySpawnedBillDraftJournal must replicate onto the successor. Unposted, so
    // it cannot disturb any posted-line check (trial balance / AP control).
    const seedLines = glC
      ? [
          { glAccountId: glA, side: 'debit',  amount: 90, description: 'QA expense' },
          { glAccountId: glB, side: 'debit',  amount: 10, description: 'QA GST' },
          { glAccountId: glC, side: 'credit', amount: 100, description: 'QA AP' },
        ]
      : [
          { glAccountId: glA, side: 'debit',  amount: 100, description: 'QA expense' },
          { glAccountId: glB, side: 'credit', amount: 100, description: 'QA AP' },
        ]
    const parentJournal = await prisma.financeJournalEntry.create({
      data: {
        reference: null,
        date: new Date(SEED_DUE),
        description: 'QA spawn-helper parent draft journal',
        type: 'auto_transaction',
        isPosted: false,
        familyId: FAMILY,
        lines: { create: seedLines },
      },
      select: { id: true },
    })
    parentJournalId = parentJournal.id

    const parent = await prisma.financeRecurringBill.create({
      data: {
        name: 'QA Spawn Bill',
        amount: 100,
        frequency: 'monthly',
        dayOfMonth: 15,
        nextDueDate: new Date(SEED_DUE),
        billDate: new Date(SEED_DUE),
        billType: 'recurring',
        status: 'awaiting_payment',
        invoiceReceived: false,
        paid: false,
        journalEntryId: parentJournalId,
        familyId: FAMILY,
      },
    })
    parentBillId = parent.id

    // Exercise the shared in-tx spawn helper exactly as the callers do.
    const spawned = await prisma.$transaction(async (tx: unknown) =>
      spawnNextBillOnPayment(tx, parent, FAMILY),
    )

    expect(spawned).toBeTruthy()
    expect(spawned.spawnedBillId).toBeTruthy()
    // STRICT-NEXT: one month after the bill's OWN due date, not "jumped past today".
    expect(spawned.spawnedBillDueDate.getTime()).toBe(EXPECT_NEXT)
    spawnedBillId = spawned.spawnedBillId
    spawnedDueDate = spawned.spawnedBillDueDate

    // Exactly ONE successor, and it is a proper draft child.
    const children = await prisma.financeRecurringBill.findMany({
      where: { parentBillId, familyId: FAMILY },
    })
    expect(children.length).toBe(1)
    const child = children[0]
    expect(child.id).toBe(spawnedBillId)
    expect(child.status).toBe('draft')
    expect(child.templateId).toBeNull()
    expect(child.paid).toBe(false)
    expect(child.invoiceReceived).toBe(false)
    expect(child.billType).toBe('recurring')
    expect(child.name).toBe('QA Spawn Bill')
    expect(child.amount).toBe(100)
    expect(child.nextDueDate.getTime()).toBe(EXPECT_NEXT)

    parentLines = await prisma.financeJournalLine.findMany({
      where: { journalEntryId: parentJournalId },
      select: { glAccountId: true, side: true, amount: true, description: true },
    })
  })

  it('copies the parent split journal onto the successor as an unposted draft', async () => {
    // Post-tx copy — exactly as the payments route / bills PATCH do after commit.
    await copySpawnedBillDraftJournal(
      spawnedBillId, parentJournalId, 'QA Spawn Bill', spawnedDueDate, FAMILY, null,
    )

    const child = await prisma.financeRecurringBill.findUniqueOrThrow({
      where: { id: spawnedBillId },
      include: { journalEntry: { include: { lines: true } } },
    })
    expect(child.journalEntryId).toBeTruthy()
    // A COPY, not a re-link to the parent's journal.
    expect(child.journalEntryId).not.toBe(parentJournalId)
    expect(child.journalEntry.isPosted).toBe(false)

    const childLines = child.journalEntry.lines
    expect(childLines.length).toBe(parentLines.length)
    for (const pl of parentLines) {
      const match = childLines.find(
        (cl: { glAccountId: string; side: string; amount: number }) =>
          cl.glAccountId === pl.glAccountId && cl.side === pl.side && cl.amount === pl.amount,
      )
      expect(match, `no copied line for ${pl.side} ${pl.amount} on ${pl.glAccountId}`).toBeTruthy()
    }
  })

  it('integrity audit gains no new critical/warning findings and trial balance balances', async () => {
    const after = await runFinanceIntegrityAudit(FAMILY)
    expect(after.summary.critical).toBe(baseline.critical)
    expect(after.summary.warning).toBe(baseline.warning)

    const byCode = Object.fromEntries(
      after.checks.map((c: { code: string; status: string }) => [c.code, c.status]),
    )
    expect(byCode['TRIAL_BALANCE_UNBALANCED']).toBe('pass')
    expect(byCode['JOURNAL_ENTRY_UNBALANCED']).toBe('pass')
    expect(byCode['AP_CONTROL_VS_SUBLEDGER']).toBe('pass')
    expect(byCode['ORPHANED_DRAFT_JOURNAL']).toBe('pass')
  })
})
