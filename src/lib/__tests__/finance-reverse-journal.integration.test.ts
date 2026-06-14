/**
 * Stage C-1 QA gate — `reverseJournalEntry` exercised against a SELF-SEEDED throwaway
 * SQLite database (built from prisma/schema.prisma), then checked with the read-only
 * integrity audit.
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated. This
 * test never touches it — `setupFinanceTestDb` creates its own database from the
 * schema, so the suite runs on EVERY machine (CI included) and no longer self-skips
 * into a false green. Run locally: `npx vitest run finance-reverse-journal`.
 *
 * Proves the three mandatory Stage C-1 assertions:
 *   1. faithful, balanced flip (sides swapped, amounts/accounts preserved, original
 *      flagged isReversed, reversal carries type/reversalOfId/entity/family);
 *   2. the intentional behaviour change — memberId is copied onto reversal lines, so
 *      a member-tagged entry nets that member back to zero (old inline copies dropped
 *      memberId and left a non-zero member attribution);
 *   3. the integrity audit gains NO new critical/warning findings and the trial
 *      balance still balances after the void.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'

const FAMILY = FINANCE_TEST_FAMILY
// AP / AR control accounts — the seeded chart contains none, so this filter passes
// every seeded account through as usable; kept for parity with the live-DB era.
const CONTROL_ACCOUNT_IDS = new Set([
  'cmozfz2uq000c01miyi36avpc', // Accounts Payable
  'cmozfyqwo000b01mio4knh0kc', // Accounts Receivable
  'cmp4y099e000h01nnzjzkgy76', // Accounts Receivable (deprecated)
])

describe('Stage C-1 — reverseJournalEntry against a self-seeded DB', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reverseJournalEntry: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextNJournalReferences: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runFinanceIntegrityAudit: any

  // Shared across the ordered tests
  let baseline: { critical: number; warning: number }
  let glA: string
  let glB: string
  let memberId: string
  let originalId: string
  let reversalId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalLines: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reversalLines: any[]

  beforeAll(async () => {
    // Build + seed a throwaway DB and bind the prisma singleton to it. Subsequent
    // dynamic imports (finance-posting / -journal-ref / -integrity) reach the same
    // singleton via their '@/lib/prisma' import (same resolved file).
    fx = await setupFinanceTestDb('hb-stage-c1-')
    prisma = fx.prisma

    ;({ reverseJournalEntry } = await import('../finance-posting'))
    ;({ nextNJournalReferences } = await import('../finance-journal-ref'))
    ;({ runFinanceIntegrityAudit } = await import('../finance-integrity'))

    // Baseline audit BEFORE we create anything.
    const before = await runFinanceIntegrityAudit(FAMILY)
    baseline = { critical: before.summary.critical, warning: before.summary.warning }

    // Two valid, non-control GL accounts that already appear in this family's
    // posted ledger (guarantees the Restrict FK + same family).
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

    // A real member id if one exists on any line; the assertion holds regardless.
    const memberLine = await prisma.financeJournalLine.findFirst({
      where: { journalEntry: { familyId: FAMILY }, memberId: { not: null } },
      select: { memberId: true },
    })
    memberId = memberLine?.memberId ?? 'qa-stage-c1-member'
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  it('connects to the seeded DB and the family has a posted ledger', async () => {
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

  it('reverseJournalEntry produces a faithful, balanced, member-preserving flip', async () => {
    // Seed a member-tagged, balanced, posted manual entry on non-control accounts.
    const [origRef] = await nextNJournalReferences(FAMILY, 1)
    const seeded = await prisma.financeJournalEntry.create({
      data: {
        reference: origRef,
        date: new Date(Date.now() - 30 * 86_400_000),
        description: 'QA Stage C-1 synthetic member-tagged entry',
        type: 'manual',
        isPosted: true,
        familyId: FAMILY,
        lines: {
          create: [
            { glAccountId: glA, side: 'debit', amount: 123.45, description: 'QA dr', memberId },
            { glAccountId: glB, side: 'credit', amount: 123.45, description: 'QA cr', memberId },
          ],
        },
      },
      select: { id: true, entityId: true },
    })
    originalId = seeded.id

    // Reverse via the shared helper — ref pre-generated BEFORE the $transaction.
    const [revRef] = await nextNJournalReferences(FAMILY, 1)
    const original = await prisma.financeJournalEntry.findUniqueOrThrow({
      where: { id: originalId },
      select: {
        id: true, reference: true, description: true, entityId: true,
        lines: { select: { glAccountId: true, side: true, amount: true, description: true, memberId: true } },
      },
    })
    const { reversalId: rid } = await prisma.$transaction(async (tx: unknown) =>
      reverseJournalEntry(tx, original, { reference: revRef, date: new Date(), familyId: FAMILY }),
    )
    reversalId = rid

    const reversal = await prisma.financeJournalEntry.findUniqueOrThrow({
      where: { id: reversalId },
      include: { lines: true },
    })
    const reReadOriginal = await prisma.financeJournalEntry.findUniqueOrThrow({
      where: { id: originalId },
      include: { lines: true },
    })
    originalLines = reReadOriginal.lines
    reversalLines = reversal.lines

    // Reversal metadata
    expect(reversal.type).toBe('reversal')
    expect(reversal.isPosted).toBe(true)
    expect(reversal.reversalOfId).toBe(originalId)
    expect(reversal.familyId).toBe(FAMILY)
    expect(reversal.entityId).toBe(seeded.entityId)
    // Original flagged reversed
    expect(reReadOriginal.isReversed).toBe(true)

    // Faithful flip: each original line has an offsetting reversal line on the
    // same account+amount with the side swapped.
    expect(reversalLines.length).toBe(originalLines.length)
    for (const ol of originalLines) {
      const match = reversalLines.find(
        (rl) =>
          rl.glAccountId === ol.glAccountId &&
          rl.amount === ol.amount &&
          rl.side === (ol.side === 'debit' ? 'credit' : 'debit'),
      )
      expect(match, `no flipped match for ${ol.side} ${ol.amount} on ${ol.glAccountId}`).toBeTruthy()
    }

    // The pair nets to zero across debits and credits.
    const both = [...originalLines, ...reversalLines]
    const dr = both.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
    const cr = both.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
    expect(Math.abs(dr - cr)).toBeLessThan(0.005)
  })

  it('preserves memberId on every reversal line (member attribution nets to zero)', () => {
    // The decisive fix: every reversal line carries the SAME memberId as the source
    // line it offsets. The old inline copies dropped memberId (→ null), which left a
    // member-tagged debit with no member-tagged credit to cancel it.
    expect(reversalLines.length).toBeGreaterThan(0)
    for (const ol of originalLines) {
      const match = reversalLines.find(
        (rl) =>
          rl.glAccountId === ol.glAccountId &&
          rl.amount === ol.amount &&
          rl.side === (ol.side === 'debit' ? 'credit' : 'debit'),
      )
      expect(match.memberId).toBe(ol.memberId)
    }
    expect(reversalLines.some((rl) => rl.memberId === memberId)).toBe(true)

    // Per-member, per-account signed net (debit +, credit −) over original+reversal
    // is exactly zero — what the member-attributed P&L / tax report reads.
    const both = [...originalLines, ...reversalLines].filter((l) => l.memberId === memberId)
    const byAccount = new Map<string, number>()
    for (const l of both) {
      const signed = (l.side === 'debit' ? 1 : -1) * l.amount
      byAccount.set(l.glAccountId, (byAccount.get(l.glAccountId) ?? 0) + signed)
    }
    for (const [, net] of byAccount) expect(Math.abs(net)).toBeLessThan(0.005)
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
    expect(byCode['REVERSAL_PAIR_BROKEN']).toBe('pass')
  })
})
