import type { DashboardData } from '@/types'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TodaysMealsCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'

export function DashboardGrid({ data, timezone }: { data: DashboardData; timezone?: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 h-full min-h-0">
      <UpcomingEventsCard events={data.upcomingEvents} timezone={timezone} />
      <TodaysMealsCard meals={data.todaysMeals} />
      <ShoppingListCard list={data.shoppingList} />
      <TodoCard todo={data.todoSummary} />
    </div>
  )
}
