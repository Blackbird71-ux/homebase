'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'
import { UniversalFAB } from './UniversalFAB'
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
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0 relative">
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
