'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'
import { OfflineBanner } from './OfflineBanner'
import { HelpButton } from './HelpButton'
import { AIAssistant } from '@/components/ai/AIAssistant'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

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

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* pb-20 on mobile gives clearance for the floating action button */}
        <div className="flex-1 overflow-hidden pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Floating action button — nav + quick-add on mobile, quick-add dialog on desktop */}
      <QuickAdd />

      {/* Context-sensitive help button */}
      <HelpButton />

      {/* AI voice/chat assistant */}
      <AIAssistant />
    </div>

  )
}
