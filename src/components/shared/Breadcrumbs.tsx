'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// Only sections whose sub-pages are static (not record detail pages, which have their own back links).
const SECTIONS: Record<string, string> = { finance: 'Finance', settings: 'Settings' }

const titleCase = (seg: string) => seg.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/** "Finance › Accounts Payable" trail for sub-pages of Finance and Settings; renders nothing elsewhere. */
export function Breadcrumbs() {
  const segments = (usePathname() ?? '').split('/').filter(Boolean)
  const section = SECTIONS[segments[0]]
  if (!section || segments.length < 2) return null

  const crumbs = segments.slice(1).map((seg, i) => ({
    label: titleCase(seg),
    href: '/' + segments.slice(0, i + 2).join('/'),
  }))

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mb-1">
      <Link href={`/${segments[0]}`} className="hover:text-foreground">{section}</Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          {i === crumbs.length - 1 ? (
            <span aria-current="page">{c.label}</span>
          ) : (
            <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
