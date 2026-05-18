import { prisma } from '@/lib/prisma'

/**
 * Returns a warning message if `postingDate` falls before the family's locked period,
 * or null if no lock is set / the date is within the allowed range.
 * Non-blocking — callers include the warning in their response but do not reject the write.
 */
export async function getPeriodLockWarning(familyId: string, postingDate: Date): Promise<string | null> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { periodLockedUntil: true },
  })
  if (!family?.periodLockedUntil) return null
  if (postingDate < family.periodLockedUntil) {
    const locked = family.periodLockedUntil.toISOString().split('T')[0]
    return `Posting into a locked accounting period (locked until ${locked}). Verify this was intended.`
  }
  return null
}
