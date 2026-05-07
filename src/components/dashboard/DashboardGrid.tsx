'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import type { DashboardData } from '@/types'
import type { DashboardCardConfig } from '@/lib/dashboard-cards'
import { usePanelResize } from '@/lib/hooks/usePanelResize'
import { cn } from '@/lib/utils'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TodaysMealsCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'
import { WeeklySummaryCard } from './WeeklySummaryCard'
import { ChoreScheduleCard } from './ChoreScheduleCard'

type ScopeDays = 7 | 14 | 30

interface DashboardGridProps {
  data: DashboardData
  timezone?: string
  cards: DashboardCardConfig[]
  /** Saved panel size fractions from uiPreferences */
  panelFractions?: number[] | null
  /** Called when panel sizes change (for persistence) */
  onPanelResize?: (fractions: number[]) => void
  /** Scope for weekly summary / chore schedule cards */
  scope?: ScopeDays
  /** Called when scope changes */
  onScopeChange?: (scope: ScopeDays) => void
  /** Loading state when re-fetching data */
  loading?: boolean
}


export function DashboardGrid({
  data,
  timezone,
  cards,
  panelFractions,
  onPanelResize,
  scope = 7,
  onScopeChange,
}: DashboardGridProps) {
  // Sort cards by order, filter visible ones
  const visibleCards = cards
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)

  // We use a 2-column layout
  const columnCount = 2

  // Split visible cards into left/right columns (alternating)
  const leftColumnCards = visibleCards.filter((_, i) => i % 2 === 0)
  const rightColumnCards = visibleCards.filter((_, i) => i % 2 === 1)

  const { sizes, setSizes, getResizeProps, isDragging } = usePanelResize(
    columnCount,
    panelFractions ?? undefined
  )

  const gridRef = useRef<HTMLDivElement>(null)

  // Store the latest onPanelResize in a ref to avoid stale closures
  const onPanelResizeRef = useRef(onPanelResize)
  onPanelResizeRef.current = onPanelResize

  // Persist sizes when they change (debounced)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current)
    }
    persistTimeoutRef.current = setTimeout(() => {
      if (onPanelResizeRef.current) {
        onPanelResizeRef.current(sizes)
      }
    }, 500)
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current)
      }
    }
  }, [sizes])

  // When panelFractions change externally (e.g., loaded from settings), update
  useEffect(() => {
    if (panelFractions && panelFractions.length === columnCount) {
      setSizes(panelFractions)
    }
  }, [panelFractions, columnCount, setSizes])

  // Compute left column width fraction
  const total = sizes.reduce((a, b) => a + b, 0)
  const leftFraction = sizes[0] / total

  // Gap is 16px (gap-4)
  const gapPx = 16
  // Handle width is 16px
  const handlePx = 16
  // Available space for columns = 100% - gap - handle
  // We split the gap so each column gets (total - handle) * fraction - gap/2
  const leftWidth = `calc(${leftFraction * 100}% - ${leftFraction * handlePx + gapPx / 2}px)`
  const rightWidth = `calc(${(1 - leftFraction) * 100}% - ${(1 - leftFraction) * handlePx + gapPx / 2}px)`

  return (
    <div className="relative pb-4">
      {/* Mobile layout: single column, no resize */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {visibleCards.map((card) => (
          <div key={card.id}>{renderCard(card, data, timezone, scope, onScopeChange)}</div>
        ))}
      </div>

      {/* Desktop layout: resizable 2-column flex layout */}
      <div ref={gridRef} className="hidden md:block">
        <div
          className="flex"
          style={{
            gap: `${gapPx}px`,
            userSelect: isDragging ? 'none' : undefined,
          }}
        >
          {/* Left column */}
          <div className="flex flex-col gap-4 min-w-0 flex-1" style={{ width: leftWidth }}>
            {leftColumnCards.map((card) => (
              <div key={card.id}>{renderCard(card, data, timezone, scope, onScopeChange)}</div>
            ))}
          </div>

          {/* Resize handle */}
          <div className="relative shrink-0" style={{ width: `${handlePx}px` }}>
            <div
              className={cn(
                'absolute inset-y-0 left-1/2 z-10 w-4 -translate-x-1/2 cursor-col-resize group/handle'
              )}
              style={{ touchAction: 'none' }}
              {...getResizeProps(0)}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full transition-all duration-150',
                  isDragging
                    ? 'bg-primary/60 w-1.5'
                    : 'bg-transparent group-hover/handle:bg-border group-hover/handle:w-1'
                )}
                style={{ touchAction: 'none' }}
              />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4 min-w-0 flex-1" style={{ width: rightWidth }}>
            {rightColumnCards.map((card) => (
              <div key={card.id}>{renderCard(card, data, timezone, scope, onScopeChange)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderCard(
  card: DashboardCardConfig,
  data: DashboardData,
  timezone?: string,
  scope?: ScopeDays,
  onScopeChange?: (scope: ScopeDays) => void
) {
  switch (card.id) {
    case 'weekly-summary':
      return <WeeklySummaryCard key={card.id} data={data.weeklySummary} scope={scope} onScopeChange={onScopeChange} />
    case 'upcoming-events':
      return <UpcomingEventsCard key={card.id} events={data.upcomingEvents} timezone={timezone} />
    case 'todays-meals':
      return <TodaysMealsCard key={card.id} meals={data.todaysMeals} title="Today's Meals" />
    case 'tomorrows-meals':
      return <TodaysMealsCard key={card.id} meals={data.tomorrowsMeals} title="Tomorrow's Meals" />
    case 'shopping-list':
      return <ShoppingListCard key={card.id} list={data.shoppingList} />
    case 'todo-summary':
      return <TodoCard key={card.id} todo={data.todoSummary} />
    case 'chore-schedule':
      return <ChoreScheduleCard key={card.id} data={data.choreSchedule} timezone={timezone} scope={scope} onScopeChange={onScopeChange} />
    default:
      return null
  }
}
