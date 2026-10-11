// Resolves a user's pins (mobile-pins.ts) into renderable shortcuts for every surface
// that shows them: the mobile + sheet, the desktop Sidebar and the command palette.
// Client-safe: lucide icons only, no prisma/server imports.
import type { ComponentType } from 'react'
import { Home, Settings, ShoppingCart, CheckSquare } from 'lucide-react'
import { isMainNavVisible } from '@/lib/mainNavKeys'
import { NAV_ITEMS } from '@/lib/nav-items'
import { pinHref, type Pin } from '@/lib/mobile-pins'

type Icon = ComponentType<{ className?: string }>

export interface PinnablePageDef {
  href: string
  label: string
  icon: Icon
}

export interface PinnableListDef {
  id: string
  name: string
  type: string
}

export interface ResolvedPin {
  pin: Pin
  href: string
  label: string
  icon: Icon
}

/** Pages a user may pin / navigate to, honouring the finance toggle and Settings → Menu. */
export function pinnablePages(hideFinanceModule: boolean, mainNav: Record<string, boolean>): PinnablePageDef[] {
  return [
    { href: '/home', label: 'Home', icon: Home },
    ...NAV_ITEMS.map(({ href, label, shortLabel, icon }) => ({ href, label: shortLabel ?? label, icon })),
    { href: '/settings', label: 'Settings', icon: Settings },
  ].filter(({ href }) => !(hideFinanceModule && href === '/finance') && isMainNavVisible(mainNav, href))
}

/** Pins that still point at something available — stale page/list pins drop out. */
export function resolvePins(pins: Pin[], pages: PinnablePageDef[], lists: PinnableListDef[]): ResolvedPin[] {
  return pins.flatMap((pin): ResolvedPin[] => {
    if (pin.type === 'page') {
      const page = pages.find((p) => p.href === pin.href)
      return page ? [{ pin, href: pinHref(pin), label: page.label, icon: page.icon }] : []
    }
    const list = lists.find((l) => l.id === pin.id)
    return list ? [{ pin, href: pinHref(pin), label: list.name, icon: list.type === 'SHOPPING' ? ShoppingCart : CheckSquare }] : []
  })
}
