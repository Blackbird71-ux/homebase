import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { FamilySettingsClient } from './FamilySettingsClient'
import { SUPPORTED_TIMEZONES } from '@/app/api/settings/family/route'
import { PageHero } from '@/components/shared/PageHero'

export default async function GeneralSettingsPage() {
  const user = await requireSession()
  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { id: true, name: true, timezone: true, loginTagline: true, financeYearStartMonth: true },
  })

  return (
    <div className="max-w-lg p-6 flex flex-col gap-6">
      <PageHero title="General Settings" />
      <FamilySettingsClient
        family={{
          name: family?.name ?? '',
          timezone: family?.timezone ?? DEFAULT_TIMEZONE,
          loginTagline: family?.loginTagline ?? '',
          financeYearStartMonth: family?.financeYearStartMonth ?? 7,
        }}
        isAdmin={user.role === 'admin'}
        supportedTimezones={[...SUPPORTED_TIMEZONES]}
      />
    </div>
  )
}
