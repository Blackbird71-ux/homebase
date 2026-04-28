import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { SUPPORTED_TIMEZONES } from '@/app/api/settings/family/route'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { AdvancedThemingTab } from '@/components/settings/AdvancedThemingTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'
import { DataTab } from '@/components/settings/DataTab'
import { ImportTab } from '@/components/settings/ImportTab'
import { TagManager } from '@/components/tags/TagManager'
import { CategoryManager } from '@/components/categories/CategoryManager'
import { IngredientMappingsTab } from '@/components/settings/IngredientMappingsTab'
import { EventCategoryManager } from '@/components/calendar/EventCategoryManager'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { ActivityLogTab } from '@/components/settings/ActivityLogTab'

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
      <div className="p-4 md:p-6 pb-0">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and family preferences.</p>
      </div>

      <div className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="account" className="w-full">
          {/* Scrollable tab bar — 11 tabs would wrap on mobile without this */}
          <div className="mb-6 overflow-x-auto">
            <TabsList className="w-max min-w-full">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="theming">Advanced Theming</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="event-categories">Event Categories</TabsTrigger>
              <TabsTrigger value="ingredient-mappings">Ingredient Mappings</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="account">
            <AccountTab
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                family: user.family,
              }}
              supportedTimezones={[...SUPPORTED_TIMEZONES]}
            />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
                initialTheme={user.theme}
                initialFontSize={user.fontSize}
                initialWeekStartsOn={user.weekStartsOn}
                initialDoneItemColor={user.doneItemColor || 'RED'}
              />
          </TabsContent>

          <TabsContent value="theming">
            <AdvancedThemingTab
              initialCustomTheme={(() => {
                if (!user.uiPreferences) return null
                try {
                  const parsed = typeof user.uiPreferences === 'string'
                    ? JSON.parse(user.uiPreferences)
                    : user.uiPreferences
                  return parsed.customTheme || null
                } catch {
                  return null
                }
              })()}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              isAdmin={user.role === 'admin'}
              initialUmamiScriptUrl={user.family.umamiScriptUrl}
              initialUmamiSiteId={user.family.umamiSiteId}
              googleConnected={user.googleConnected}
              googleEmail={user.googleEmail}
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

          <TabsContent value="import">
            <ImportTab />
          </TabsContent>

          <TabsContent value="tags">
            <TagManager />
          </TabsContent>

          <TabsContent value="categories">
            <CategoryManager />
          </TabsContent>

          <TabsContent value="event-categories">
            <EventCategoryManager />
          </TabsContent>

          <TabsContent value="ingredient-mappings">
            <IngredientMappingsTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityLogTab />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
