'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'
import { CommandPalette } from './CommandPalette'
import { UniversalFAB } from './UniversalFAB'
import { OfflineBanner } from './OfflineBanner'
import { HelpButton } from './HelpButton'
import { AIAssistant } from '@/components/ai/AIAssistant'
import { useGlobalOfflineFlush } from '@/hooks/useGlobalOfflineFlush'
import { useLocationReporter } from '@/hooks/useLocationReporter'

export function AppShell({ children, isAdmin = false, hideFinanceModule = false, familyName, memberName, memberRole, shareLocation = false }: { children: React.ReactNode; isAdmin?: boolean; hideFinanceModule?: boolean; familyName?: string; memberName?: string; memberRole?: string; shareLocation?: boolean }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const [helpOpen, setHelpOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  // Replays the offline mutation queue from anywhere in the app
  useGlobalOfflineFlush()

  // Reports this device's location while sharing is enabled (foreground only)
  useLocationReporter(shareLocation)

  // Listen for custom events from QuickAdd dialog or UniversalFAB sheet
  useEffect(() => {
    function handleOpenAI() { setAiOpen(true) }
    function handleOpenHelp() { setHelpOpen(true) }
    window.addEventListener('homebase:open-ai', handleOpenAI)
    window.addEventListener('homebase:open-help', handleOpenHelp)
    return () => {
      window.removeEventListener('homebase:open-ai', handleOpenAI)
      window.removeEventListener('homebase:open-help', handleOpenHelp)
    }
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen-dvh w-screen overflow-hidden">
      <OfflineBanner />
      <div className="relative shrink-0 hidden md:block">
        <Sidebar collapsed={sidebarCollapsed} isAdmin={isAdmin} hideFinanceModule={hideFinanceModule} familyName={familyName} memberName={memberName} memberRole={memberRole} />
        <button
          type="button"
          onClick={toggleSidebar}
          className="hb-sidebar__toggle-float"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0 relative">
        {/* pb-16 gives clearance for the universal FAB on all screen sizes */}
        <div className="flex-1 overflow-hidden pb-16">
          {children}
        </div>
      </main>

      {/* Universal floating action button — visible on all screen sizes */}
      <UniversalFAB hideFinanceModule={hideFinanceModule} />

      {/* Quick-add dialog — triggered by FAB, sidebar button, or the palette's > actions */}
      <QuickAdd />

      {/* ⌘K command palette — global search, navigation, and quick-add launcher */}
      <CommandPalette isAdmin={isAdmin} hideFinanceModule={hideFinanceModule} />

      {/* Context-sensitive help dialog */}
      <HelpButton open={helpOpen} onOpenChange={setHelpOpen} />

      {/* AI voice/chat assistant panel */}
      <AIAssistant open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  )
}
