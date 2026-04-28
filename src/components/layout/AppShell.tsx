'use client'

import { Sidebar } from './Sidebar'
import { QuickAdd } from './QuickAdd'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* pb-20 on mobile gives clearance for the floating action button */}
        <div className="flex-1 overflow-hidden pb-20 md:pb-0">
          {children}
        </div>
      </main>

      {/* Floating action button — nav + quick-add on mobile, quick-add only on desktop */}
      <QuickAdd />
    </div>
  )
}
