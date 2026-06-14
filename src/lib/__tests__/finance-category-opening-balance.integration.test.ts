/**
 * WI-1 (P7-FC-01) QA gate — `setCategoryOpeningBalance` exercised against a
 * SELF-SEEDED throwaway SQLite database (built from prisma/schema.prisma), then
 * checked against the Balance Sheet and a journal-line trial balance.
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated.
 * This test never touches it — `setupFinanceTestDb` creates its own database from
 * the schema. Run locally: `npx vitest run finance-category-opening-balance`.
 *
 * Proves the WI-1 fix: a COA opening balance posts a real, balanced
 * `opening_balance` journal entry (DR/CR the category on its normal side, contra
 * to the system Opening Balances equity account) so that:
 *   1. the opening JE itself is balanced (SUM debit = SUM credit);
 *   2. the Balance Sheet reconciles — `equityMatchesNetWorth` is true, i.e.
 *      Assets − Liabilities = Equity (BS = TB, both sourced from posted lines);
 *   3. re-setting REPLACES rather than stacks (exactly one opening JE remains);
 *   4. clearing removes the JE and nulls the mirror field.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'

const FAMILY = FINANCE_TEST_FAMILY

/** SUM(debit) and SUM(credit) over every posted line — the trial-balance check. */
async function trialBalanceTotals(prisma: any): Promise<{ debit: number; credit: number }> {
  const lines = await prisma.financeJournalLine.findMany({
    where: { journalEntry: { familyId: FAMILY, isPosted: true } },
    select: { side: true, amount: true },
  })
  let debit = 0
  let credit = 0
  for (const l of lines) {
    if (l.side === 'debit') debit += l.amount
    else credit += l.amount
  }
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 }
}

describe('WI-1 — setCategoryOpeningBalance journalises + keeps BS = TB', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setCategoryOpeningBalance: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let computeBalanceSheet: any
  let vehicleId: string

  beforeAll(async () => {
    fx = await setupFinanceTestDb('hb-cat-ob-')
    prisma = fx.prisma
    ;({ setCategoryOpeningBalance } = await import('../finance-opening-balance'))
    ;({ computeBalanceSheet } = await import('../finance-balance-sheet'))

    // A fresh asset COA account with no prior journal activity.
    const vehicle = await prisma.financeCategory.create({
      data: { familyId: FAMILY, name: 'Vehicle', type: 'asset' },
      select: { id: true },
    })
    vehicleId = vehicle.id
  })

  afterAll(async () => {
    await fx.cleanup()
  })

  it('posts a single balanced opening_balance JE on the category and its OBE contra', async () => {
    await setCategoryOpeningBalance(vehicleId, FAMILY, 5000, new Date('2026-01-01T00:00:00Z'))

    const obJournals = await prisma.financeJournalEntry.findMany({
      where: { familyId: FAMILY, type: 'opening_balance', lines: { some: { glAccountId: vehicleId } } },
      include: { lines: { select: { glAccountId: true, side: true, amount: true } } },
    })
    expect(obJournals).toHaveLength(1)

    const lines = obJournals[0].lines
    expect(lines).toHaveLength(2)
    const debit = lines.filter((l: any) => l.side === 'debit').reduce((s: number, l: any) => s + l.amount, 0)
    const credit = lines.filter((l: any) => l.side === 'credit').reduce((s: number, l: any) => s + l.amount, 0)
    expect(debit).toBeCloseTo(credit, 2)

    // Asset is debit-normal: a positive opening balance sits on the debit side.
    const vehLine = lines.find((l: any) => l.glAccountId === vehicleId)
    expect(vehLine.side).toBe('debit')
    expect(vehLine.amount).toBeCloseTo(5000, 2)

    // Mirror field updated for the Categories UI.
    const cat = await prisma.financeCategory.findUnique({
      where: { id: vehicleId },
      select: { openingBalance: true, openingBalanceDate: true },
    })
    expect(cat.openingBalance).toBeCloseTo(5000, 2)
    expect(cat.openingBalanceDate).not.toBeNull()
  })

  it('keeps the Balance Sheet reconciled (equityMatchesNetWorth) and TB balanced', async () => {
    const bs = await computeBalanceSheet(FAMILY, new Date('2026-12-31T23:59:59Z'))
    expect(bs.equityMatchesNetWorth).toBe(true)
    // Assets − Liabilities = Equity ⇒ the BS internally balances.
    expect(bs.assets.total - bs.liabilities.total).toBeCloseTo(bs.equity.total, 2)

    // Trial balance (all posted lines) still balances ⇒ BS = TB.
    const tb = await trialBalanceTotals(prisma)
    expect(tb.debit).toBeCloseTo(tb.credit, 2)
  })

  it('replaces rather than stacks on re-set', async () => {
    await setCategoryOpeningBalance(vehicleId, FAMILY, 8000, new Date('2026-01-01T00:00:00Z'))

    const obJournals = await prisma.financeJournalEntry.findMany({
      where: { familyId: FAMILY, type: 'opening_balance', lines: { some: { glAccountId: vehicleId } } },
      include: { lines: { select: { glAccountId: true, side: true, amount: true } } },
    })
    expect(obJournals).toHaveLength(1)
    const vehLine = obJournals[0].lines.find((l: any) => l.glAccountId === vehicleId)
    expect(vehLine.amount).toBeCloseTo(8000, 2)

    const bs = await computeBalanceSheet(FAMILY, new Date('2026-12-31T23:59:59Z'))
    expect(bs.equityMatchesNetWorth).toBe(true)
    const tb = await trialBalanceTotals(prisma)
    expect(tb.debit).toBeCloseTo(tb.credit, 2)
  })

  it('clears the JE and nulls the mirror field when set to null', async () => {
    await setCategoryOpeningBalance(vehicleId, FAMILY, null, null)

    const obJournals = await prisma.financeJournalEntry.findMany({
      where: { familyId: FAMILY, type: 'opening_balance', lines: { some: { glAccountId: vehicleId } } },
      select: { id: true },
    })
    expect(obJournals).toHaveLength(0)

    const cat = await prisma.financeCategory.findUnique({
      where: { id: vehicleId },
      select: { openingBalance: true, openingBalanceDate: true },
    })
    expect(cat.openingBalance).toBeNull()
    expect(cat.openingBalanceDate).toBeNull()

    // Back to the seeded baseline — still balanced.
    const bs = await computeBalanceSheet(FAMILY, new Date('2026-12-31T23:59:59Z'))
    expect(bs.equityMatchesNetWorth).toBe(true)
    const tb = await trialBalanceTotals(prisma)
    expect(tb.debit).toBeCloseTo(tb.credit, 2)
  })
})
