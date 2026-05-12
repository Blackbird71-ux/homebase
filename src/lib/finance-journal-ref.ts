import { prisma } from '@/lib/prisma'

/**
 * Generate the next unique journal entry reference for a family (JE-XXXX).
 *
 * Uses MAX of existing reference numbers, not COUNT, so gaps left by deleted
 * entries never produce a collision. For example: if JE-0004 was deleted,
 * COUNT=5 would generate JE-0006 which already exists — MAX correctly yields
 * JE-0007.
 *
 * Must be called inside a P2002 retry loop because two concurrent requests can
 * read the same MAX and race to create the same reference. The unique constraint
 * on (familyId, reference) will reject one of them; the retry generates a fresh
 * reference on the next attempt.
 */
export async function nextJournalReference(familyId: string): Promise<string> {
  const entries = await prisma.financeJournalEntry.findMany({
    where: { familyId, reference: { not: null } },
    select: { reference: true },
  })
  let max = 0
  for (const e of entries) {
    if (!e.reference) continue
    const m = e.reference.match(/^JE-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `JE-${String(max + 1).padStart(4, '0')}`
}
