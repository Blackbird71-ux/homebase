'use client'

import { useState, useCallback, useRef } from 'react'
import { Settings2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardCustomiser } from '@/components/dashboard/DashboardCustomiser'
import type { DashboardCardConfig } from '@/lib/dashboard-cards'
import type { DashboardData } from '@/types'

type ScopeDays = 7 | 14 | 30

interface HomeClientProps {
  data: DashboardData
  timezone: string
  initialCards: DashboardCardConfig[]
  initialPanelFractions?: number[] | null
}

export function HomeClient({
  data: initialData,
  timezone,
  initialCards,
  initialPanelFractions,
}: HomeClientProps) {
  const [data, setData] = useState(initialData)
  const [cards, setCards] = useState(initialCards)
  const [customiserOpen, setCustomiserOpen] = useState(false)
  const [panelFractions, setPanelFractions] = useState<number[] | null>(
    initialPanelFractions ?? null
  )
  const [scope, setScope] = useState<ScopeDays>(7)
  const [loading, setLoading] = useState(false)

  // Use a ref to track the latest fractions for the save callback
  const panelFractionsRef = useRef(panelFractions)
  panelFractionsRef.current = panelFractions

  function handleSaved(savedCards: DashboardCardConfig[]) {
    setCards(savedCards)
  }

  const handlePanelResize = useCallback(async (fractions: number[]) => {
    setPanelFractions(fractions)

    // Persist to server
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uiPreferences: { dashboardPanelFractions: fractions },
        }),
      })
    } catch {
      // Silently fail - the UI state is still correct
    }
  }, [])

  // Re-fetch dashboard data when scope changes
  const handleScopeChange = useCallback(async (newScope: ScopeDays) => {
    setScope(newScope)
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard?scope=${newScope}`)
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
          panelFractions={panelFractions}
          onPanelResize={handlePanelResize}
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
