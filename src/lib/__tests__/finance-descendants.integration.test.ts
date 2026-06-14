/**
 * WI-5 (P3-FC-03 + P4-FC-02) QA gate — the shared descendant-cascade helpers
 * `deleteUnpaidBillDescendants` / `deleteUnreceivedIncomeDescendants` exercised
 * against a SELF-SEEDED throwaway SQLite database (built from prisma/schema.prisma).
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated.
 * `setupFinanceTestDb` builds its own database, so this never touches it. Run:
 *   `npx vitest run finance-descendants`
 *
 * Both parent FKs (parentBillId / parentIncomeId) are onDelete: SetNull. The
 * retired inline BFS deleted a whole level by id, then queried the NEXT level by
 * `parentBillId IN <deleted ids>` — but SetNull had already nulled those links,
 * so a multi-level unpaid chain stranded its grandchildren. These tests lock the
 * surviving depth-first contract:
 *
 *   1. A 3-deep all-unpaid chain master→c1→c2 is removed ENTIRELY when cascading
 *      from master (the BFS would have left c2 orphaned).
 *   2. A paid/received intermediate STOPS the cascade: master→c1(settled)→c2 keeps
 *      both c1 (carries GL, audited) and c2 (c1's legitimate successor draft).
 *   3. The cascade only prunes descendants — the parent row itself is untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'

const FAMILY = FINANCE_TEST_FAMILY

describe('WI-5 — shared descendant cascade is depth-first and SetNull-safe', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deleteUnpaidBillDescendants: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deleteUnreceivedIncomeDescendants: any

  beforeAll(async () => {
    fx = await setupFinanceTestDb('hb-descendants-')
    prisma = fx.prisma
    ;({ deleteUnpaidBillDescendants, deleteUnreceivedIncomeDescendants } =
      await import('../finance-descendants'))
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  /** Create a recurring bill; minimal required fields + parent link & paid flag. */
  async function makeBill(name: string, parentBillId: string | null, paid: boolean): Promise<string> {
    const b = await prisma.financeRecurringBill.create({
      data: {
        name, amount: 100, frequency: 'monthly', dayOfMonth: 15,
        nextDueDate: new Date('2026-01-15T00:00:00Z'),
        billDate: new Date('2026-01-15T00:00:00Z'),
        billType: 'recurring', status: 'awaiting_payment',
        invoiceReceived: false, paid, parentBillId, familyId: FAMILY,
      },
      select: { id: true },
    })
    return b.id
  }

  async function makeIncome(name: string, parentIncomeId: string | null, received: boolean): Promise<string> {
    const e = await prisma.financeIncomeEntry.create({
      data: {
        name, amount: 100, frequency: 'monthly',
        nextExpectedDate: new Date('2026-01-15T00:00:00Z'),
        received, parentIncomeId, familyId: FAMILY,
      },
      select: { id: true },
    })
    return e.id
  }

  const billExists = async (id: string) =>
    (await prisma.financeRecurringBill.count({ where: { id } })) > 0
  const incomeExists = async (id: string) =>
    (await prisma.financeIncomeEntry.count({ where: { id } })) > 0

  it('removes an entire all-unpaid bill chain master→c1→c2 (BFS would strand c2)', async () => {
    const master = await makeBill('master', null, false)
    const c1 = await makeBill('c1', master, false)
    const c2 = await makeBill('c2', c1, false)

    await prisma.$transaction((tx: unknown) => deleteUnpaidBillDescendants(master, FAMILY, tx))

    expect(await billExists(master)).toBe(true)  // parent untouched
    expect(await billExists(c1)).toBe(false)
    expect(await billExists(c2)).toBe(false)
  })

  it('stops the bill cascade at a paid intermediate, keeping it and its successor', async () => {
    const master = await makeBill('master2', null, false)
    const c1 = await makeBill('c1-paid', master, true)   // settled → carries GL
    const c2 = await makeBill('c2-under-paid', c1, false) // c1's legitimate draft

    await prisma.$transaction((tx: unknown) => deleteUnpaidBillDescendants(master, FAMILY, tx))

    expect(await billExists(master)).toBe(true)
    expect(await billExists(c1)).toBe(true)
    expect(await billExists(c2)).toBe(true)
  })

  it('removes an entire all-unreceived income chain master→c1→c2', async () => {
    const master = await makeIncome('inc-master', null, false)
    const c1 = await makeIncome('inc-c1', master, false)
    const c2 = await makeIncome('inc-c2', c1, false)

    await prisma.$transaction((tx: unknown) => deleteUnreceivedIncomeDescendants(master, FAMILY, tx))

    expect(await incomeExists(master)).toBe(true)
    expect(await incomeExists(c1)).toBe(false)
    expect(await incomeExists(c2)).toBe(false)
  })

  it('stops the income cascade at a received intermediate', async () => {
    const master = await makeIncome('inc-master2', null, false)
    const c1 = await makeIncome('inc-c1-recv', master, true)
    const c2 = await makeIncome('inc-c2-under-recv', c1, false)

    await prisma.$transaction((tx: unknown) => deleteUnreceivedIncomeDescendants(master, FAMILY, tx))

    expect(await incomeExists(master)).toBe(true)
    expect(await incomeExists(c1)).toBe(true)
    expect(await incomeExists(c2)).toBe(true)
  })
})
