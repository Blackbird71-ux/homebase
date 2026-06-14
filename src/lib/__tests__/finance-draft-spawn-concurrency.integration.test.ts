/**
 * WI-6 (P6-FC-01) QA gate — the cron catch-up worker `spawnDraftsForTemplate`
 * counts and persists the schedule cursor/counter correctly under skips and a
 * concurrent receipt/payment advance. Exercised against a SELF-SEEDED throwaway
 * SQLite database (built from prisma/schema.prisma).
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated.
 * `setupFinanceTestDb` builds its own database, so this never touches it. Run:
 *   `npx vitest run finance-draft-spawn-concurrency`
 *
 * The bug being locked out (P6-FC-01): the catch-up loop used to (a) decrement
 * `occurrencesRemaining` on EVERY iteration — including a draft it only SKIPPED
 * because a receipt/payment trigger had already materialised AND counted it — so
 * a `for_n_occurrences` template ended an occurrence early; and (b) BLIND-WRITE
 * the loop-local cursor/counter back over whatever the row held, clobbering a
 * concurrent receipt's advance (rewinding `nextOccurrenceDate`, losing its
 * decrement). The fix: count only drafts the cron actually created, and persist
 * with a re-read-inside-transaction `max(cursor)` + relative `stored - spawned`.
 *
 * A single-line bill template is used so each spawn is a plain FinanceRecurringBill
 * with no draft journal (snapshotLines.length < 2) — no AP control account needed,
 * keeping the seeded chart's clean baseline.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'

const FAMILY = FINANCE_TEST_FAMILY

// Monthly-on-the-15th template; for_n_occurrences with 5 to go.
const JUL = new Date(Date.UTC(2026, 6, 15)) // 2026-07-15
const AUG = new Date(Date.UTC(2026, 7, 15)) // 2026-08-15
const SEP = new Date(Date.UTC(2026, 8, 15)) // 2026-09-15
const OCT = new Date(Date.UTC(2026, 9, 15)) // 2026-10-15

// SessionUser is only consulted in the GL-vanished branch (not reached here,
// because the line's glAccountId is a live seeded account).
const USER = { id: 'qa-user', familyId: FAMILY, role: 'admin' }

describe('WI-6 — cron spawn counts created-only and persists cursor/counter concurrency-safely', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spawnDraftsForTemplate: any
  let glA: string

  beforeAll(async () => {
    fx = await setupFinanceTestDb('hb-spawn-conc-')
    prisma = fx.prisma
    glA = fx.accounts.assetA
    ;({ spawnDraftsForTemplate } = await import('../finance-draft-spawn-service'))
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  /** Create a single-line monthly for_n bill template at cursor=JUL, remaining=5. */
  async function makeTemplate(name: string): Promise<string> {
    const t = await prisma.financeRecurringTemplate.create({
      data: {
        familyId: FAMILY,
        kind: 'bill',
        name,
        frequency: 'monthly',
        interval: 1,
        dayOfMonth: 15,
        startDate: JUL,
        nextOccurrenceDate: JUL,
        endMode: 'for_n_occurrences',
        totalOccurrences: 5,
        occurrencesRemaining: 5,
        createInAdvanceDays: 0,
        defaultDueOffsetDays: 0,
        createdBy: 'qa-user',
        lines: {
          create: [
            { description: 'QA expense', qty: 1, unitPrice: 100, amount: 100, side: 'debit', glAccountId: glA },
          ],
        },
      },
      select: { id: true },
    })
    return t.id
  }

  /** Re-read the template as the FullTemplate (lines included) the worker expects. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullTemplate = (id: string): Promise<any> =>
    prisma.financeRecurringTemplate.findFirstOrThrow({ where: { id }, include: { lines: true } })

  const readRow = (id: string) =>
    prisma.financeRecurringTemplate.findUniqueOrThrow({
      where: { id },
      select: { nextOccurrenceDate: true, occurrencesRemaining: true },
    })

  /** Pre-create a cron-equivalent draft bill for an occurrence (simulates a prior trigger). */
  async function seedDraftBill(templateId: string, occurrence: Date): Promise<void> {
    await prisma.financeRecurringBill.create({
      data: {
        name: 'QA expense', amount: 100, frequency: 'monthly', dayOfMonth: 15,
        billDate: occurrence, nextDueDate: occurrence, billType: 'recurring',
        status: 'draft', invoiceReceived: false, paid: false,
        templateId, familyId: FAMILY,
      },
    })
  }

  it('headline trace: a clean 3-occurrence catch-up decrements the counter by exactly 3', async () => {
    const id = await makeTemplate('QA Headline')
    const tpl = await fullTemplate(id)

    // asOf = Sep 20 → JUL, AUG, SEP within window; OCT (Oct 15) outside.
    const result = await spawnDraftsForTemplate(USER, tpl, new Date(Date.UTC(2026, 8, 20)))

    expect(result.spawned).toBe(3)
    expect(result.skippedExisting).toBe(0)

    const row = await readRow(id)
    expect(row.occurrencesRemaining).toBe(2)               // 5 − 3
    expect(row.nextOccurrenceDate.getTime()).toBe(OCT.getTime())

    const drafts = await prisma.financeRecurringBill.count({ where: { templateId: id } })
    expect(drafts).toBe(3)
  })

  it('a skipped (already-materialised) occurrence is NOT counted against the schedule', async () => {
    const id = await makeTemplate('QA Skip')
    // A receipt/payment trigger already created AND counted the AUG draft.
    await seedDraftBill(id, AUG)
    const tpl = await fullTemplate(id)

    // asOf = Sep 20 → cron walks JUL (created), AUG (skipped), SEP (created).
    const result = await spawnDraftsForTemplate(USER, tpl, new Date(Date.UTC(2026, 8, 20)))

    expect(result.spawned).toBe(2)
    expect(result.skippedExisting).toBe(1)

    const row = await readRow(id)
    // 5 − 2 (created only) = 3. The retired code decremented for the skip too → 2.
    expect(row.occurrencesRemaining).toBe(3)
    expect(row.nextOccurrenceDate.getTime()).toBe(OCT.getTime())

    // The pre-seeded AUG draft survives; exactly one draft per occurrence-day.
    const drafts = await prisma.financeRecurringBill.count({ where: { templateId: id } })
    expect(drafts).toBe(3)
  })

  it('a concurrent receipt advance is composed-with, never rewound or clobbered', async () => {
    const id = await makeTemplate('QA Concurrent')
    // Snapshot the template as the worker would read it at start-of-walk:
    // cursor=JUL, remaining=5.
    const tpl = await fullTemplate(id)

    // WHILE the worker walks (here: between the snapshot and the persist), a
    // receipt/payment trigger advances the SAME row two occurrences ahead and
    // decrements the counter: cursor → OCT, remaining → 2.
    await prisma.financeRecurringTemplate.update({
      where: { id },
      data: { nextOccurrenceDate: OCT, occurrencesRemaining: 2 },
    })

    // asOf = Jul 20 → only JUL is within the cron's advance window, so the worker
    // spawns exactly one draft and its loop-local cursor lands on AUG.
    const result = await spawnDraftsForTemplate(USER, tpl, new Date(Date.UTC(2026, 6, 20)))
    expect(result.spawned).toBe(1)

    const row = await readRow(id)
    // Cursor: max(ours=AUG, stored=OCT) = OCT — the concurrent advance is NOT
    // rewound to AUG (the retired blind write would have).
    expect(row.nextOccurrenceDate.getTime()).toBe(OCT.getTime())
    // Counter: stored(2) − spawned(1) = 1 — our decrement COMPOSES with the
    // receipt's instead of clobbering it back to 4.
    expect(row.occurrencesRemaining).toBe(1)
  })
})
