import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountTab } from '@/components/settings/AccountTab'
import { SUPPORTED_TIMEZONES } from '@/app/api/settings/family/route'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'
import { DataTab } from '@/components/settings/DataTab'
import { ImportTab } from '@/components/settings/ImportTab'
import { TagManager } from '@/components/tags/TagManager'
import { CategoryManager } from '@/components/categories/CategoryManager'
import { IngredientMappingsTab } from '@/components/settings/IngredientMappingsTab'
import { EventCategoryManager } from '@/components/calendar/EventCategoryManager'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { ActivityLogTab } from '@/components/settings/ActivityLogTab'
import { EmailTab } from '@/components/settings/EmailTab'
import { AISettingsTab } from '@/components/settings/AISettingsTab'
import { LoginPageTab } from '@/components/settings/LoginPageTab'

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
            financeYearStartMonth: true,  // Spec §2.7 — needed by AccountTab
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
          {/* Scrollable tab bar — 14 tabs would wrap on mobile without overflow-x-auto */}
          <div className="mb-6 overflow-x-auto">
            <TabsList className="w-max min-w-full">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="event-categories">Event Categories</TabsTrigger>
              <TabsTrigger value="ingredient-mappings">Ingredient Mappings</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              {user.role === 'admin' && (
                <TabsTrigger value="login-page">Login page</TabsTrigger>
              )}
              {user.role === 'admin' && (
                <TabsTrigger value="email">Email</TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="account">
            <AccountTab
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                family: user.family,  // now includes financeYearStartMonth
              }}
              supportedTimezones={[...SUPPORTED_TIMEZONES]}
            />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
              initialTheme={user.theme}
              initialFontSize={user.fontSize}
              initialLineHeight={user.lineHeight}
              initialFontWeight={user.fontWeight}
              initialWeekStartsOn={user.weekStartsOn}
              initialDoneItemColor={user.doneItemColor || 'RED'}
              initialSecureCardStyle={user.uiPreferences ? (JSON.parse(user.uiPreferences)?.secureCardStyle ?? 'blur') : 'blur'}
              initialSecureCardColor={user.uiPreferences ? (JSON.parse(user.uiPreferences)?.secureCardColor ?? 'default') : 'default'}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              googleConnected={user.googleConnected}
              googleEmail={user.googleEmail ?? null}
            />
          </TabsContent>

          <TabsContent value="data">
            <DataTab coziImports={coziImports.map(i => ({
              ...i,
              importedAt: i.importedAt.toISOString(),
            }))} />
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

          <TabsContent value="ai">
            <AISettingsTab />
          </TabsContent>

          {user.role === 'admin' && (
            <TabsContent value="login-page">
              <LoginPageTab
                initialTagline={user.family.loginTagline ?? ''}
                initialVersion={user.family.appVersion ?? ''}
              />
            </TabsContent>
          )}

          {user.role === 'admin' && (
            <TabsContent value="email">
              <EmailTab />
            </TabsContent>
          )}

        </Tabs>
      </div>
    </div>
  )
}
