'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePins } from './PinsProvider'

/**
 * Always-visible strip of the user's pinned shortcuts — one click from any page.
 * Desktop widths only (md+): on phones the bar would cost screen height, and the
 * FAB sheet already carries the pins there.
 */
export function PinnedBar() {
  const pathname = usePathname()
  const { shownPins, openEditor } = usePins()
  if (shownPins.length === 0) return null

  return (
    <nav
      aria-label="Pinned shortcuts"
      className="shrink-0 hidden md:flex items-center gap-1.5 overflow-x-auto border-b border-border bg-background px-3 py-1.5"
    >
      {shownPins.map(({ href, label, icon: Icon, pin }) => {
        const isActive = pin.type === 'page' && (pathname === href || pathname.startsWith(href + '/'))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-foreground hover:bg-accent'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        )
      })}
      <button
        type="button"
        onClick={openEditor}
        aria-label="Edit pins"
        title="Edit pins"
        className="ml-auto shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </nav>
  )
}
