'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'
import { UniversalFAB } from './UniversalFAB'
import { TopBarActions } from './TopBarActions'
import { OfflineBanner } from './OfflineBanner'
import { HelpButton } from './HelpButton'
import { AIAssistant } from '@/components/ai/AIAssistant'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const [helpOpen, setHelpOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <OfflineBanner />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0 relative">
        {/* Top-right AI + Help buttons */}
        <TopBarActions
          onOpenAI={() => setAiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        {/* pb-16 gives clearance for the universal FAB on all screen sizes */}
        <div className="flex-1 overflow-hidden pb-16">
          {children}
        </div>
      </main>

      {/* Universal floating action button — visible on all screen sizes */}
      <UniversalFAB />

      {/* Quick-add dialog — triggered by FAB or keyboard shortcut */}
      <QuickAdd />

      {/* Context-sensitive help dialog */}
      <HelpButton open={helpOpen} onOpenChange={setHelpOpen} />

      {/* AI voice/chat assistant panel */}
      <AIAssistant open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  )
}
