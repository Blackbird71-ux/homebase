'use client'

import { useState, useCallback, useRef } from 'react'
import { Settings2Icon, LayoutGridIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardGrid, type DashboardGridHandle } from '@/components/dashboard/DashboardGrid'
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
  dashboardShoppingListId?: string | null
  availableShoppingLists?: { id: string; name: string }[]
  dashboardTodoListId?: string | null
  availableTodoLists?: { id: string; name: string }[]
  dashboardScope?: ScopeDays
  dashboardChoreShowOnlyMine?: boolean
}

export function HomeClient({
  data: initialData,
  timezone,
  initialCards,
  initialLayouts,
  dashboardShoppingListId,
  availableShoppingLists,
  dashboardTodoListId,
  availableTodoLists,
  dashboardScope,
  dashboardChoreShowOnlyMine,
}: HomeClientProps) {
  const [data, setData] = useState(initialData)
  const [cards, setCards] = useState(initialCards)
  const [customiserOpen, setCustomiserOpen] = useState(false)
  const [scope, setScope] = useState<ScopeDays>(dashboardScope ?? 7)
  const [choreShowOnlyMine, setChoreShowOnlyMine] = useState(dashboardChoreShowOnlyMine ?? false)
  const [currentTodoListId, setCurrentTodoListId] = useState<string | null>(dashboardTodoListId ?? null)
  const [currentShoppingListId, setCurrentShoppingListId] = useState<string | null>(dashboardShoppingListId ?? null)
  const [loading, setLoading] = useState(false)
  const gridRef = useRef<DashboardGridHandle>(null)

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

  const fetchDashboard = useCallback(async (newScope: ScopeDays, todoListId: string | null, shoppingListId: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: String(newScope) })
      if (todoListId) params.set('dashboardTodoListId', todoListId)
      if (shoppingListId) params.set('dashboardShoppingListId', shoppingListId)
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
  }, [])

  const handleScopeChange = useCallback(async (newScope: ScopeDays) => {
    setScope(newScope)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardScope: newScope } }),
      })
    } catch {
      // Silently fail
    }
    await fetchDashboard(newScope, currentTodoListId, currentShoppingListId)
  }, [currentTodoListId, currentShoppingListId, fetchDashboard])

  const handleChoreShowOnlyMineChange = useCallback(async (onlyMine: boolean) => {
    setChoreShowOnlyMine(onlyMine)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardChoreShowOnlyMine: onlyMine } }),
      })
    } catch {
      // Silently fail
    }
  }, [])

  const handleTodoListChange = useCallback(async (listId: string) => {
    setCurrentTodoListId(listId)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardTodoListId: listId } }),
      })
    } catch {
      // Silently fail
    }
    await fetchDashboard(scope, listId, currentShoppingListId)
  }, [scope, currentShoppingListId, fetchDashboard])

  const handleShoppingListChange = useCallback(async (listId: string) => {
    setCurrentShoppingListId(listId)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardShoppingListId: listId } }),
      })
    } catch {
      // Silently fail
    }
    await fetchDashboard(scope, currentTodoListId, listId)
  }, [scope, currentTodoListId, fetchDashboard])

  const handleResetLayout = useCallback(async () => {
    gridRef.current?.resetLayouts()
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { dashboardCardLayouts: {} } }),
      })
    } catch {
      // Silently fail
    }
  }, [])

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-semibold">Home</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetLayout}
          >
            <LayoutGridIcon className="h-4 w-4 mr-1" />
            Reset Layout
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomiserOpen(true)}
          >
            <Settings2Icon className="h-4 w-4 mr-1" />
            Customise
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <DashboardGrid
          ref={gridRef}
          data={data}
          timezone={timezone}
          cards={cards}
          layoutData={initialLayouts}
          onLayoutsChange={handleLayoutsChange}
          scope={scope}
          onScopeChange={handleScopeChange}
          loading={loading}
          availableTodoLists={availableTodoLists}
          selectedTodoListId={currentTodoListId}
          onTodoListChange={handleTodoListChange}
          choreShowOnlyMine={choreShowOnlyMine}
          onChoreShowOnlyMineChange={handleChoreShowOnlyMineChange}
          availableShoppingLists={availableShoppingLists}
          selectedShoppingListId={currentShoppingListId}
          onShoppingListChange={handleShoppingListChange}
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
