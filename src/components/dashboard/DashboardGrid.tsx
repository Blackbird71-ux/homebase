'use client'

import type { DashboardData } from '@/types'
import type { DashboardCardConfig } from '@/lib/dashboard-cards'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TodaysMealsCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'
import { WeeklySummaryCard } from './WeeklySummaryCard'

interface DashboardGridProps {
  data: DashboardData
  timezone?: string
  cards: DashboardCardConfig[]
}

export function DashboardGrid({ data, timezone, cards }: DashboardGridProps) {
  // Sort cards by order, filter visible ones
  const visibleCards = cards
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
      {visibleCards.map((card) => {
        switch (card.id) {
          case 'weekly-summary':
            return (
              <WeeklySummaryCard
                key={card.id}
                data={data.weeklySummary}
              />
            )
          case 'upcoming-events':
            return (
              <UpcomingEventsCard
                key={card.id}
                events={data.upcomingEvents}
                timezone={timezone}
              />
            )
          case 'todays-meals':
            return (
              <TodaysMealsCard
                key={card.id}
                meals={data.todaysMeals}
                title="Today's Meals"
              />
            )
          case 'tomorrows-meals':
            return (
              <TodaysMealsCard
                key={card.id}
                meals={data.tomorrowsMeals}
                title="Tomorrow's Meals"
              />
            )
          case 'shopping-list':
            return (
              <ShoppingListCard
                key={card.id}
                list={data.shoppingList}
              />
            )
          case 'todo-summary':
            return (
              <TodoCard
                key={card.id}
                todo={data.todoSummary}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
