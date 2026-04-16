import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { FamilySettingsClient } from './FamilySettingsClient'
import { SUPPORTED_TIMEZONES } from '@/app/api/settings/family/route'

export default async function GeneralSettingsPage() {
  const user = await requireSession()
  const family = await prisma.family.findUnique({
    where: { id: user.familyId },
    select: { id: true, name: true, timezone: true },
  })

  return (
    <div className="max-w-lg p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">General settings</h1>
      <FamilySettingsClient
        family={{ name: family?.name ?? '', timezone: family?.timezone ?? 'Australia/Sydney' }}
        isAdmin={user.role === 'admin'}
        supportedTimezones={[...SUPPORTED_TIMEZONES]}
      />
    </div>
  )
}
