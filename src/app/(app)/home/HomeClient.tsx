'use client'

import { useState, useCallback, useRef } from 'react'
import { Settings2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardCustomiser } from '@/components/dashboard/DashboardCustomiser'
import type { DashboardCardConfig } from '@/lib/dashboard-cards'
import type { CardLayoutMap } from '@/lib/hooks/useCardLayout'
import type { DashboardData } from '@/types'

type ScopeDays = 7 | 14 | 30

interface HomeClientProps {
  data: DashboardData
  timezone: string
  initialCards: DashboardCardConfig[]
  initialLayouts?: CardLayoutMap | null
  dashboardTodoListId?: string | null
}

export function HomeClient({
  data: initialData,
  timezone,
  initialCards,
  initialLayouts,
  dashboardTodoListId,
}: HomeClientProps) {
  const [data, setData] = useState(initialData)
  const [cards, setCards] = useState(initialCards)
  const [customiserOpen, setCustomiserOpen] = useState(false)
  const [scope, setScope] = useState<ScopeDays>(7)
  const [loading, setLoading] = useState(false)

  // Track layouts for persistence via debounced save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLayoutsChange = useCallback((layouts: CardLayoutMap) => {
    // Debounce save to server
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Only save layouts that exist in our card set
        const saveData: Record<string, { x: number; y: number; width: number; height: number | 'auto' }> = {}
        for (const card of cards) {
          if (layouts[card.id]) {
            saveData[card.id] = {
              x: Math.round(layouts[card.id].x * 100) / 100,
              y: Math.round(layouts[card.id].y * 100) / 100,
              width: Math.round(layouts[card.id].width * 100) / 100,
              height: layouts[card.id].height,
            }
          }
        }
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uiPreferences: { dashboardCardLayouts: saveData },
          }),
        })
      } catch {
        // Silently fail - the UI state is still correct
      }
    }, 500)
  }, [cards])

  function handleSaved(savedCards: DashboardCardConfig[]) {
    setCards(savedCards)
  }

  // Re-fetch dashboard data when scope changes
  const handleScopeChange = useCallback(async (newScope: ScopeDays) => {
    setScope(newScope)
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: String(newScope) })
      if (dashboardTodoListId) {
        params.set('dashboardTodoListId', dashboardTodoListId)
      }
      const res = await fetch(`/api/dashboard?${params.toString()}`)
      if (res.ok) {
        const freshData: DashboardData = await res.json()
        setData(freshData)
      }
    } catch {
      // Silently fail - stale data will still be shown
    } finally {
      setLoading(false)
    }
  }, [dashboardTodoListId])

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-semibold">Home</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCustomiserOpen(true)}
        >
          <Settings2Icon className="h-4 w-4 mr-1" />
          Customise
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <DashboardGrid
          data={data}
          timezone={timezone}
          cards={cards}
          layoutData={initialLayouts}
          onLayoutsChange={handleLayoutsChange}
          scope={scope}
          onScopeChange={handleScopeChange}
          loading={loading}
        />
      </div>
      <DashboardCustomiser
        open={customiserOpen}
        onOpenChange={setCustomiserOpen}
        initialCards={cards}
        onSaved={handleSaved}
      />
    </div>
  )
}
