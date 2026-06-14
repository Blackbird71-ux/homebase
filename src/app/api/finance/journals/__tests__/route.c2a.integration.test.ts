/**
 * Stage C-2a QA gate — the journals route's reverse / void / amend handlers
 * exercised END-TO-END against a WRITABLE COPY of the real SQLite database, then
 * checked with the read-only integrity audit.
 *
 * C-2a converted those three handlers from hand-rolled inline GL-reversal copies
 * (array-form `$transaction([...])`) onto the shared `reverseJournalEntry` helper
 * (already proven in finance-reverse-journal.integration.test.ts). C-2a is meant
 * to be BEHAVIOUR-NEUTRAL, so this test pins the externally observable behaviour
 * the frontend and the DELETE undo paths depend on:
 *   • reverse → 201, returns the reversal with the full ENTRY_INCLUDE shape
 *     (lines[].glAccount), type='reversal', reversalOfId→original, flipped lines
 *     with memberId preserved, original flagged isReversed; DELETE the reversal
 *     child (DELETE case 3) restores the original to un-reversed.
 *   • void → 201, helper-default `VOID: …` description, original flagged
 *     isReversed; DELETE the reversed original (DELETE case 2) removes original +
 *     reversal child together.
 *   • amend → 201, returns the CORRECTIVE entry carrying `.reference`
 *     (AmendmentDialog reads only this) + amendmentOfId→original, original
 *     flagged isReversed, a reversal child exists; DELETE the corrective
 *     (DELETE case 5) removes corrective + reversal and restores the original.
 *   • after the full cycle the integrity audit gains NO new critical/warning and
 *     the trial balance still balances.
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated.
 * This never touches it — `setupFinanceTestDb` builds its own database from
 * prisma/schema.prisma, so the suite runs on EVERY machine (CI included) instead of
 * self-skipping into a false green. Run locally: `npx vitest run route.c2a`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from '@/lib/__tests__/_finance-test-db'

// Only @/lib/auth is mocked — everything else (prisma, finance-posting,
// finance-integrity, finance-journal-ref) is the REAL module bound to the seeded DB.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const FAMILY = FINANCE_TEST_FAMILY
// AP / AR control accounts — the seeded chart contains none, so this filter passes
// every seeded account through as usable; kept for parity with the live-DB era.
const CONTROL_ACCOUNT_IDS = new Set([
  'cmozfz2uq000c01miyi36avpc', // Accounts Payable
  'cmozfyqwo000b01mio4knh0kc', // Accounts Receivable
  'cmp4y099e000h01nnzjzkgy76', // Accounts Receivable (deprecated)
])

function patchReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof import('../route')['PATCH']>[0]
}
function deleteReq(id: string) {
  return { url: `http://localhost/api/finance/journals?id=${encodeURIComponent(id)}` } as unknown as Parameters<
    typeof import('../route')['DELETE']
  >[0]
}

describe('Stage C-2a — journals reverse/void/amend handlers against a self-seeded DB', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PATCH: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextJournalReference: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runFinanceIntegrityAudit: any

  let baseline: { critical: number; warning: number }
  let glA: string
  let glB: string
  let memberId: string

  // Seed a posted, balanced, member-tagged manual entry directly (not via route).
  async function seedEntry(): Promise<string> {
    const reference = await nextJournalReference(FAMILY)
    const e = await prisma.financeJournalEntry.create({
      data: {
        reference,
        date: new Date(Date.now() - 20 * 86_400_000),
        description: 'QA Stage C-2a synthetic entry',
        type: 'manual',
        isPosted: true,
        familyId: FAMILY,
        lines: {
          create: [
            { glAccountId: glA, side: 'debit', amount: 77.7, description: 'QA dr', memberId },
            { glAccountId: glB, side: 'credit', amount: 77.7, description: 'QA cr', memberId },
          ],
        },
      },
      select: { id: true },
    })
    return e.id
  }

  beforeAll(async () => {
    // Build + seed a throwaway DB and bind the prisma singleton to it.
    fx = await setupFinanceTestDb('hb-stage-c2a-')
    prisma = fx.prisma

    // auth() → a session for the seeded family.
    const { auth } = await import('@/lib/auth')
    ;(auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      user: { id: 'qa-c2a', familyId: FAMILY },
    })

    // Dynamic imports so the route + finance-integrity + finance-journal-ref reach
    // the same prisma singleton the fixture constructed on the seeded DB.
    ;({ PATCH, DELETE } = await import('../route'))
    ;({ nextJournalReference } = await import('@/lib/finance-journal-ref'))
    ;({ runFinanceIntegrityAudit } = await import('@/lib/finance-integrity'))

    const before = await runFinanceIntegrityAudit(FAMILY)
    baseline = { critical: before.summary.critical, warning: before.summary.warning }

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

    const memberLine = await prisma.financeJournalLine.findFirst({
      where: { journalEntry: { familyId: FAMILY }, memberId: { not: null } },
      select: { memberId: true },
    })
    memberId = memberLine?.memberId ?? 'qa-c2a-member'
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  it('connects to the seeded DB with a clean baseline and usable accounts', async () => {
    expect(glA).toBeTruthy()
    expect(glB).toBeTruthy()
    expect(glA).not.toBe(glB)
    expect(baseline.critical).toBe(0)
  })

  it('reverse → 201 full ENTRY_INCLUDE shape, flipped + memberId-preserving; DELETE child (case 3) restores original', async () => {
    const originalId = await seedEntry()

    const res = await PATCH(patchReq({ id: originalId, action: 'reverse' }))
    expect(res.status).toBe(201)
    const body = await res.json()

    // Shape proves the post-helper re-fetch wiring (findUnique + ENTRY_INCLUDE).
    expect(body.type).toBe('reversal')
    expect(body.reversalOfId).toBe(originalId)
    expect(body.isPosted).toBe(true)
    expect(Array.isArray(body.lines)).toBe(true)
    expect(body.lines.length).toBe(2)
    expect(body.lines[0]).toHaveProperty('glAccount') // ENTRY_INCLUDE nested select

    // Faithful flip + memberId carried onto every reversal line.
    const original = await prisma.financeJournalEntry.findUniqueOrThrow({
      where: { id: originalId },
      include: { lines: true },
    })
    expect(original.isReversed).toBe(true)
    for (const ol of original.lines) {
      const match = body.lines.find(
        (rl: { glAccountId: string; amount: number; side: string; memberId: string | null }) =>
          rl.glAccountId === ol.glAccountId &&
          rl.amount === ol.amount &&
          rl.side === (ol.side === 'debit' ? 'credit' : 'debit'),
      )
      expect(match, `no flipped match for ${ol.side} ${ol.amount}`).toBeTruthy()
      expect(match.memberId).toBe(ol.memberId)
    }

    // DELETE case 3: deleting the reversal child restores the parent to un-reversed.
    const del = await DELETE(deleteReq(body.id))
    expect(del.status).toBe(200)
    const reReadOriginal = await prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: originalId } })
    expect(reReadOriginal.isReversed).toBe(false)
    expect(await prisma.financeJournalEntry.findUnique({ where: { id: body.id } })).toBeNull()
  })

  it('void → 201 with helper-default VOID description; DELETE reversed original (case 2) removes the pair', async () => {
    const originalId = await seedEntry()
    const seeded = await prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: originalId } })

    const res = await PATCH(patchReq({ id: originalId, action: 'void' }))
    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.type).toBe('reversal')
    expect(body.reversalOfId).toBe(originalId)
    // Helper default text must match what the old inline copy produced exactly.
    expect(body.description).toBe(`VOID: ${seeded.reference} — ${seeded.description}`)

    const original = await prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: originalId } })
    expect(original.isReversed).toBe(true)

    // DELETE case 2: deleting the reversed original removes original + reversal child.
    const del = await DELETE(deleteReq(originalId))
    expect(del.status).toBe(200)
    expect(await prisma.financeJournalEntry.findUnique({ where: { id: originalId } })).toBeNull()
    expect(await prisma.financeJournalEntry.findUnique({ where: { id: body.id } })).toBeNull()
  })

  it('amend → 201 corrective with .reference + amendmentOfId, reversal child created; DELETE corrective (case 5) restores original', async () => {
    const originalId = await seedEntry()

    const res = await PATCH(
      patchReq({
        id: originalId,
        action: 'amend',
        correctionDate: '2026-05-31',
        correctionDescription: 'QA C-2a corrected entry',
        correctionLines: [
          { glAccountId: glA, side: 'debit', amount: 88.8, memberId },
          { glAccountId: glB, side: 'credit', amount: 88.8, memberId },
        ],
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    // AmendmentDialog reads result.reference off the corrective entry — must exist.
    expect(body.reference).toBeTruthy()
    expect(body.amendmentOfId).toBe(originalId)
    expect(body.type).toBe('manual') // corrective preserves the original's type
    expect(body.reversalOfId).toBeFalsy() // corrective is NOT the reversal
    const correctiveId = body.id

    // Original flagged reversed, and exactly one reversal child was created.
    const original = await prisma.financeJournalEntry.findUniqueOrThrow({
      where: { id: originalId },
      include: { reversals: { select: { id: true } } },
    })
    expect(original.isReversed).toBe(true)
    expect(original.reversals.length).toBe(1)
    const reversalId = original.reversals[0].id

    // DELETE case 5: deleting the corrective removes corrective + reversal and
    // restores the original to active.
    const del = await DELETE(deleteReq(correctiveId))
    expect(del.status).toBe(200)
    const reReadOriginal = await prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: originalId } })
    expect(reReadOriginal.isReversed).toBe(false)
    expect(await prisma.financeJournalEntry.findUnique({ where: { id: correctiveId } })).toBeNull()
    expect(await prisma.financeJournalEntry.findUnique({ where: { id: reversalId } })).toBeNull()
  })

  it('integrity audit gains no new critical/warning and the trial balance still balances', async () => {
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
