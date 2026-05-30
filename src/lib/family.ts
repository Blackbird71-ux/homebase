import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'

/**
 * Resolve a family's IANA timezone for server-side date logic.
 *
 * The family's saved `timezone` setting always wins; `DEFAULT_TIMEZONE` is used
 * only when the family is missing or has no timezone set. Use this instead of
 * inlining `family?.timezone ?? 'Australia/Sydney'` so the fallback lives in one
 * place and the family setting is honoured everywhere.
 */
export async function getFamilyTimezone(familyId: string): Promise<string> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { timezone: true },
  })
  return family?.timezone ?? DEFAULT_TIMEZONE
}
