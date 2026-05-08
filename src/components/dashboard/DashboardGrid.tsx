'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { DashboardData } from '@/types'
import type { DashboardCardConfig } from '@/lib/dashboard-cards'
import type { CardLayoutMap } from '@/lib/hooks/useCardLayout'
import { useCardLayout } from '@/lib/hooks/useCardLayout'
import { cn } from '@/lib/utils'
import { DashboardCardWrapper } from './DashboardCardWrapper'
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
  /** Saved card layouts from uiPreferences */
  layoutData?: CardLayoutMap | null
  /** Called when layouts change (for persistence) */
  onLayoutsChange?: (layouts: CardLayoutMap) => void
  /** Scope for weekly summary / chore schedule cards */
  scope?: ScopeDays
  /** Called when scope changes */
  onScopeChange?: (scope: ScopeDays) => void
  /** Loading state when re-fetching data */
  loading?: boolean
}

export interface DashboardGridHandle {
  resetLayouts: () => void
}

export const DashboardGrid = forwardRef<DashboardGridHandle, DashboardGridProps>(function DashboardGrid({
  data,
  timezone,
  cards,
  layoutData,
  onLayoutsChange,
  scope = 7,
  onScopeChange,
}, ref) {
  // Sort cards by order, filter visible ones
  const visibleCards = cards
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)

  const cardIds = visibleCards.map((c) => c.id)

  // Build initial layouts from saved data, merging with card ids
  const initialLayouts: CardLayoutMap = {}
  if (layoutData) {
    for (const id of cardIds) {
      if (layoutData[id]) {
        initialLayouts[id] = { ...layoutData[id] }
      }
    }
  }

  const {
    layouts,
    containerRef,
    isDragging,
    dragCardId,
    isResizing,
    resizeCardId,
    handleDragStart,
    handleResizeStart,
    toggleWidth,
    resetLayouts,
  } = useCardLayout(initialLayouts, cardIds, onLayoutsChange)

  useImperativeHandle(ref, () => ({ resetLayouts }), [resetLayouts])

  // Track container width for x/width percentage calculations
  const containerWidthRef = useRef(800)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidthRef.current = entry.contentRect.width
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  return (
    <div className="relative pb-4">
      {/* Mobile layout: single column stacked */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {visibleCards.map((card) => (
          <div key={card.id}>{renderCard(card, data, timezone, scope, onScopeChange)}</div>
        ))}
      </div>

      {/* Desktop layout: free-form absolute positioning */}
      <div
        ref={containerRef}
        className={cn(
          'hidden md:relative md:block',
          'min-h-[600px]', // Ensure minimum height for drag area
        )}
        style={{
          userSelect: isDragging || isResizing ? 'none' : undefined,
        }}
      >
        {visibleCards.map((card) => {
          const layout = layouts[card.id]
          if (!layout) return null

          return (
            <DashboardCardWrapper
              key={card.id}
              cardId={card.id}
              layout={layout}
              isDragging={isDragging}
              isResizing={isResizing}
              isDragActive={dragCardId === card.id}
              isResizeActive={resizeCardId === card.id}
              onDragStart={handleDragStart}
              onResizeStart={handleResizeStart}
              onToggleWidth={toggleWidth}
              containerWidth={containerWidthRef.current}
              allLayouts={layouts}
            >
              {renderCard(card, data, timezone, scope, onScopeChange)}
            </DashboardCardWrapper>
          )
        })}
      </div>
    </div>
  )
})

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
