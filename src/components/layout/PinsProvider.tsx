'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Pin } from '@/lib/mobile-pins'
import { pinnablePages, resolvePins, type ResolvedPin } from '@/lib/pinned-shortcuts'
import { PinsDrawer, type PinnableList } from './PinsDrawer'

interface PinsContextValue {
  /** Pins that still resolve to an available page/list, in the user's order */
  shownPins: ResolvedPin[]
  openEditor: () => void
}

const PinsContext = createContext<PinsContextValue>({ shownPins: [], openEditor: () => {} })

export function usePins() {
  return useContext(PinsContext)
}

/**
 * Single owner of the user's pins (uiPreferences.mobilePins) so the mobile sheet,
 * desktop Sidebar and command palette stay in step, and one editor drawer serves all.
 */
export function PinsProvider({
  initialPins,
  hideFinanceModule,
  mainNav,
  children,
}: {
  initialPins: Pin[]
  hideFinanceModule: boolean
  mainNav: Record<string, boolean>
  children: React.ReactNode
}) {
  const [pins, setPins] = useState<Pin[]>(initialPins)
  const [editorOpen, setEditorOpen] = useState(false)
  const [lists, setLists] = useState<PinnableList[]>([])

  const hasListPin = pins.some((p) => p.type === 'list')

  // Active lists (id/name/type only) are fetched on mount when a list is pinned and
  // again each time the editor opens, so pinned lists show current names and a pin to
  // an archived/deleted list simply drops out.
  useEffect(() => {
    if (!editorOpen && !hasListPin) return
    let cancelled = false
    fetch('/api/lists?meta=true')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PinnableList[]) => { if (!cancelled) setLists(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [editorOpen, hasListPin])

  const pages = useMemo(() => pinnablePages(hideFinanceModule, mainNav), [hideFinanceModule, mainNav])
  const shownPins = useMemo(() => resolvePins(pins, pages, lists), [pins, pages, lists])
  const value = useMemo(() => ({ shownPins, openEditor: () => setEditorOpen(true) }), [shownPins])

  return (
    <PinsContext.Provider value={value}>
      {children}
      <PinsDrawer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        pins={pins}
        pages={pages.map(({ href, label }) => ({ href, label }))}
        lists={lists}
        onSaved={setPins}
      />
    </PinsContext.Provider>
  )
}
