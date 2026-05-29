import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { TemplatesClient } from './TemplatesClient'

export default async function TemplatesPage() {
  const userSession = await requireSession()
  const user = await prisma.user.findUnique({
    where: { id: userSession.id },
    select: { family: { select: { timezone: true } } },
  })
  // Occurrence dates are stored as UTC midnight; render in the family timezone
  // so they show the correct local calendar day regardless of the device tz.
  const timezone = user?.family.timezone ?? 'Australia/Sydney'

  return <TemplatesClient timezone={timezone} />
}
