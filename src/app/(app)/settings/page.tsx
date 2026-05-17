import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { SUPPORTED_TIMEZONES } from '@/app/api/settings/family/route'

export default async function SettingsPage() {
  const session = await requireSession()

  const [user, coziImports] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        fontSize: true,
        lineHeight: true,
        fontWeight: true,
        weekStartsOn: true,
        doneItemColor: true,
        uiPreferences: true,
        googleConnected: true,
        googleEmail: true,
        family: {
          select: {
            id: true,
            name: true,
            timezone: true,
            umamiScriptUrl: true,
            umamiSiteId: true,
            loginTagline: true,
            appVersion: true,
            financeYearStartMonth: true,
          },
        },
      },
    }),
    prisma.coziImport.findMany({
      where: { familyId: session.familyId },
      orderBy: { importedAt: 'desc' },
      select: {
        id: true,
        importedAt: true,
        eventCount: true,
        notes: true,
      },
    }),
  ])

  if (!user) return null

  return (
    <SettingsClient
      isAdmin={user.role === 'admin'}
      user={user}
      coziImports={coziImports.map((i) => ({
        ...i,
        importedAt: i.importedAt.toISOString(),
      }))}
      supportedTimezones={[...SUPPORTED_TIMEZONES]}
    />
  )
}
