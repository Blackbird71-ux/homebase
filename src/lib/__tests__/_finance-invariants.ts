/**
 * Shared accountant-grade invariant assertions for finance integration suites.
 *
 * Automates QA.md §2 (accounting invariants), §5 (lifecycle smoke checks) and
 * §6 (accountant verification checklist) as reusable assertions so every
 * lifecycle suite checks the SAME ledger properties after every step:
 *
 *   • §2.1 — every posted journal entry balances (DR = CR) and has no
 *     nonpositive lines (assertPostedLedgerInvariants, per-entry)
 *   • §6.1 — the trial balance sums to zero across all posted lines
 *     (assertPostedLedgerInvariants, whole-ledger)
 *   • §6.2 — a named GL account's posted net balance (DR − CR) equals an
 *     expected figure, e.g. AP/AR control vs the subledger the suite built
 *     (glNetBalance + the caller's expect)
 *   • §5/§6 — the read-only integrity audit stays green on named check codes
 *     (assertAuditCodesPass) — validity of these codes as an oracle is proven
 *     by the RED suite (finance-integrity-red), which injects each bug class
 *     and asserts the check flips pass→fail.
 *
 * These are direct DB computations (not audit re-exports) so a failure names
 * the exact journal/account with its DR/CR totals — precise enough for a
 * future session to act on without re-deriving context.
 *
 * Test-only helper (underscore prefix keeps it out of the vitest include glob).
 */
import { expect } from 'vitest'

/** Same rounding tolerance the posting layer and integrity audit use. */
export const BALANCE_EPSILON = 0.005

interface LedgerLine {
  side: string
  amount: number
}

/**
 * QA.md §2.1 + §6.1: every POSTED journal entry balances (DR = CR), no posted
 * line has a nonpositive amount, and the whole-ledger trial balance is zero.
 * Run after every lifecycle step — any GL write that breaks these is a
 * stop-ship defect regardless of what the step was trying to do.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertPostedLedgerInvariants(prisma: any, familyId: string): Promise<void> {
  const entries: { id: string; reference: string | null; lines: LedgerLine[] }[] =
    await prisma.financeJournalEntry.findMany({
      where: { familyId, isPosted: true },
      select: { id: true, reference: true, lines: { select: { side: true, amount: true } } },
    })
  expect(entries.length, 'expected at least one posted journal entry').toBeGreaterThan(0)

  let tbDebit = 0
  let tbCredit = 0
  for (const e of entries) {
    const label = e.reference ?? e.id
    let dr = 0
    let cr = 0
    for (const l of e.lines) {
      expect(l.amount, `nonpositive posted line amount ${l.amount} on journal ${label}`).toBeGreaterThan(0)
      if (l.side === 'debit') dr += l.amount
      else cr += l.amount
    }
    expect(
      Math.abs(dr - cr),
      `journal ${label} unbalanced: DR ${dr.toFixed(4)} ≠ CR ${cr.toFixed(4)}`,
    ).toBeLessThanOrEqual(BALANCE_EPSILON)
    tbDebit += dr
    tbCredit += cr
  }
  expect(
    Math.abs(tbDebit - tbCredit),
    `trial balance unbalanced: total DR ${tbDebit.toFixed(4)} ≠ total CR ${tbCredit.toFixed(4)}`,
  ).toBeLessThanOrEqual(BALANCE_EPSILON)
}

/**
 * Assert a specific journal entry is posted, un-reversed, and consists of
 * EXACTLY the expected lines (glAccountId + side + amount, order-independent).
 * This is the QA.md §2.3 journal-template check: e.g. a bill accrual must be
 * DR Expense / CR AP at the bill amount — nothing more, nothing less.
 */
export async function assertJournalPosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  journalEntryId: string,
  expectedLines: { glAccountId: string; side: 'debit' | 'credit'; amount: number }[],
): Promise<void> {
  const je: {
    isPosted: boolean
    isReversed: boolean
    reference: string | null
    lines: { glAccountId: string; side: string; amount: number }[]
  } = await prisma.financeJournalEntry.findUniqueOrThrow({
    where: { id: journalEntryId },
    select: {
      isPosted: true,
      isReversed: true,
      reference: true,
      lines: { select: { glAccountId: true, side: true, amount: true } },
    },
  })
  const label = je.reference ?? journalEntryId
  expect(je.isPosted, `journal ${label} is not posted`).toBe(true)
  expect(je.isReversed, `journal ${label} is unexpectedly reversed`).toBe(false)
  expect(
    je.lines.length,
    `journal ${label} has ${je.lines.length} lines, expected ${expectedLines.length}`,
  ).toBe(expectedLines.length)
  for (const exp of expectedLines) {
    const match = je.lines.find(
      l => l.glAccountId === exp.glAccountId && l.side === exp.side && Math.abs(l.amount - exp.amount) <= BALANCE_EPSILON,
    )
    expect(
      match,
      `journal ${label} missing expected line: ${exp.side} ${exp.amount} on GL ${exp.glAccountId} — actual lines: ${JSON.stringify(je.lines)}`,
    ).toBeTruthy()
  }
}

/**
 * QA.md §6.2: the posted net balance (DR − CR) of one GL account across all
 * live (un-reversed included — reversals net themselves out) posted lines.
 * Sign convention: positive = net debit. An AP control account therefore
 * reads NEGATIVE here when it carries a credit balance; callers assert
 * against -expected for liabilities.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glNetBalance(prisma: any, glAccountId: string): Promise<number> {
  const lines: LedgerLine[] = await prisma.financeJournalLine.findMany({
    where: { glAccountId, journalEntry: { isPosted: true } },
    select: { side: true, amount: true },
  })
  return lines.reduce((sum, l) => sum + (l.side === 'debit' ? l.amount : -l.amount), 0)
}

/**
 * Resolve a system control account the way the integrity audit does
 * (isSystem + type + case-insensitive name needle) — e.g.
 * findControlAccount(prisma, familyId, 'liability', 'accounts payable').
 * Returns null when absent, so a suite can assert the posting layer created it.
 */
export async function findControlAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  familyId: string,
  type: 'liability' | 'asset',
  needle: string,
): Promise<string | null> {
  const matches: { id: string }[] = await prisma.financeCategory.findMany({
    where: { familyId, isSystem: true, type },
    select: { id: true, name: true },
  })
  const hit = matches.filter((c: { id: string; name?: string }) =>
    (c as { name: string }).name.toLowerCase().includes(needle),
  )
  return hit.length === 1 ? hit[0].id : null
}

/**
 * Assert the named integrity-audit check codes all report 'pass'. Pair with a
 * summary comparison against the suite's captured baseline so NEW findings of
 * any code also fail the suite.
 */
export function assertAuditCodesPass(
  audit: { checks: { code: string; status: string }[]; findings?: { code: string; message?: string }[] },
  codes: string[],
): void {
  const byCode = new Map(audit.checks.map(c => [c.code, c.status]))
  for (const code of codes) {
    const status = byCode.get(code)
    const related = (audit.findings ?? []).filter(f => f.code === code).map(f => f.message)
    expect(
      status,
      `audit check ${code} is '${status}' — findings: ${JSON.stringify(related)}`,
    ).toBe('pass')
  }
}
