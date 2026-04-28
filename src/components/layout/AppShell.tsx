'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Restore collapse preference on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setSidebarCollapsed(true)
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* pb-20 on mobile gives clearance for the floating action button */}
        <div className="flex-1 overflow-hidden pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Floating action button — nav + quick-add on mobile, quick-add dialog on desktop */}
      <QuickAdd />
    </div>
  )
}
