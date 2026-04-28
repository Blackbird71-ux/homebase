'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Sidebar, SidebarContent } from './Sidebar'
import { MobileNav } from './MobileNav'
import { QuickAdd } from './QuickAdd'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile overlay backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile slide-in nav */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-52 md:hidden transform transition-transform duration-200 ease-in-out ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <SidebarContent onNavigate={() => setNavOpen(false)} />
      </div>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border md:hidden shrink-0">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
            <span aria-hidden="true">🏠</span> Homebase
          </span>
        </div>

        {/* Page content — add bottom padding on mobile for the tab bar */}
        <div className="flex-1 overflow-hidden pb-14 md:pb-0">
          {children}
        </div>

        {/* Bottom tab bar on mobile */}
        <MobileNav />
      </main>

      {/* Quick-add command palette (available everywhere) */}
      <QuickAdd />
    </div>
  )
}
