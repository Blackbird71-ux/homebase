import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'
import { DataTab } from '@/components/settings/DataTab'

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
        weekStartsOn: true,
        family: {
          select: {
            id: true,
            name: true,
            umamiScriptUrl: true,
            umamiSiteId: true,
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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="account" className="w-full max-w-2xl">
          <TabsList className="mb-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <AccountTab user={user} />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
                initialTheme={user.theme}
                initialFontSize={user.fontSize}
                initialWeekStartsOn={user.weekStartsOn}
              />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              isAdmin={user.role === 'admin'}
              initialUmamiScriptUrl={user.family.umamiScriptUrl}
              initialUmamiSiteId={user.family.umamiSiteId}
            />
          </TabsContent>

          <TabsContent value="data">
            <DataTab
              coziImports={coziImports.map(c => ({
                ...c,
                importedAt: c.importedAt instanceof Date ? c.importedAt.toISOString() : String(c.importedAt),
              }))}
              userEmail={user.email}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
