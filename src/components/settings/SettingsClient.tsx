'use client'

import { useState } from 'react'
import { PillNav } from '@/components/shared/PillNav'
import {
  User, Palette, Plug, Database, Upload, Tag, FolderOpen,
  CalendarDays, Soup, DollarSign, Bell, ActivitySquare, Bot,
  MonitorPlay, Mail,
} from 'lucide-react'
import { AccountTab } from '@/components/settings/AccountTab'
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
import { FinanceTab } from '@/components/settings/FinanceTab'

// ── Tab definitions ────────────────────────────────────────────────────────────

const BASE_TABS = [
  { id: 'account',              label: 'Account',             icon: User },
  { id: 'appearance',           label: 'Appearance',          icon: Palette },
  { id: 'integrations',         label: 'Integrations',        icon: Plug },
  { id: 'data',                 label: 'Data',                icon: Database },
  { id: 'import',               label: 'Import',              icon: Upload },
  { id: 'tags',                 label: 'Tags',                icon: Tag },
  { id: 'categories',           label: 'Categories',          icon: FolderOpen },
  { id: 'event-categories',     label: 'Event Categories',    icon: CalendarDays },
  { id: 'ingredient-mappings',  label: 'Ingredients',         icon: Soup },
  { id: 'finance',              label: 'Finance',             icon: DollarSign },
  { id: 'notifications',        label: 'Notifications',       icon: Bell },
  { id: 'activity',             label: 'Activity Log',        icon: ActivitySquare },
  { id: 'ai',                   label: 'AI',                  icon: Bot },
] as const

const ADMIN_TABS = [
  { id: 'login-page', label: 'Login Page', icon: MonitorPlay },
  { id: 'email',      label: 'Email',      icon: Mail },
] as const

type BaseTabId  = (typeof BASE_TABS)[number]['id']
type AdminTabId = (typeof ADMIN_TABS)[number]['id']
type TabId = BaseTabId | AdminTabId

// ── Props ──────────────────────────────────────────────────────────────────────

interface SettingsClientProps {
  isAdmin: boolean
  user: {
    id: string
    name: string
    email: string
    role: string
    theme: string | null
    fontSize: string | null
    lineHeight: string | null
    fontWeight: string | null
    weekStartsOn: number | null
    doneItemColor: string | null
    uiPreferences: string | null
    googleConnected: boolean
    googleEmail: string | null
    family: {
      id: string
      name: string
      timezone: string
      umamiScriptUrl: string | null
      umamiSiteId: string | null
      loginTagline: string | null
      appVersion: string | null
      financeYearStartMonth: number | null
    }
  }
  coziImports: {
    id: string
    importedAt: string
    eventCount: number
    notes: string | null
  }[]
  supportedTimezones: string[]
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SettingsClient({ isAdmin, user, coziImports, supportedTimezones }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('account')

  const tabs = [
    ...BASE_TABS,
    ...(isAdmin ? ADMIN_TABS : []),
  ]

  const uiPrefs = (() => {
    try { return user.uiPreferences ? JSON.parse(user.uiPreferences) : {} }
    catch { return {} }
  })()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-border shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your account and family preferences.</p>

        {/* PillNav tab bar — scrollable on mobile */}
        <div className="mt-4 overflow-x-auto pb-1">
          <PillNav
            items={tabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            size="sm"
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4 md:p-6">
        {activeTab === 'account' && (
          <AccountTab
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              family: user.family,
            }}
            supportedTimezones={supportedTimezones}
          />
        )}
        {activeTab === 'appearance' && (
          <AppearanceTab
            initialTheme={user.theme}
            initialFontSize={user.fontSize}
            initialLineHeight={user.lineHeight}
            initialFontWeight={user.fontWeight}
            initialWeekStartsOn={user.weekStartsOn}
            initialDoneItemColor={user.doneItemColor || 'RED'}
            initialSecureCardStyle={uiPrefs?.secureCardStyle ?? 'blur'}
            initialSecureCardColor={uiPrefs?.secureCardColor ?? 'default'}
          />
        )}
        {activeTab === 'integrations' && (
          <IntegrationsTab
            isAdmin={user.role === 'admin'}
            initialUmamiScriptUrl={user.family.umamiScriptUrl}
            initialUmamiSiteId={user.family.umamiSiteId}
            googleConnected={user.googleConnected}
            googleEmail={user.googleEmail ?? null}
          />
        )}
        {activeTab === 'data' && (
          <DataTab
            coziImports={coziImports}
            userEmail={user.email}
          />
        )}
        {activeTab === 'import'             && <ImportTab />}
        {activeTab === 'tags'               && <TagManager />}
        {activeTab === 'categories'         && <CategoryManager />}
        {activeTab === 'event-categories'   && <EventCategoryManager />}
        {activeTab === 'ingredient-mappings'&& <IngredientMappingsTab />}
        {activeTab === 'finance'            && <FinanceTab />}
        {activeTab === 'notifications'      && <NotificationSettings />}
        {activeTab === 'activity'           && <ActivityLogTab />}
        {activeTab === 'ai'                 && <AISettingsTab />}
        {activeTab === 'login-page' && isAdmin && (
          <LoginPageTab
            initialTagline={user.family.loginTagline ?? ''}
            initialVersion={user.family.appVersion ?? ''}
          />
        )}
        {activeTab === 'email' && isAdmin && <EmailTab />}
      </div>
    </div>
  )
}
