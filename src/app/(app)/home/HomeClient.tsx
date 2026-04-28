'use client'

import { useState } from 'react'
import { Settings2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardCustomiser } from '@/components/dashboard/DashboardCustomiser'
import { mergeDashboardCards, type DashboardCardConfig } from '@/lib/dashboard-cards'
import type { DashboardData } from '@/types'

interface HomeClientProps {
  data: DashboardData
  timezone: string
  initialCards: DashboardCardConfig[]
}

export function HomeClient({ data, timezone, initialCards }: HomeClientProps) {
  const [cards, setCards] = useState(initialCards)
  const [customiserOpen, setCustomiserOpen] = useState(false)

  function handleSaved(savedCards: DashboardCardConfig[]) {
    setCards(savedCards)
  }

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
        <DashboardGrid data={data} timezone={timezone} cards={cards} />
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
