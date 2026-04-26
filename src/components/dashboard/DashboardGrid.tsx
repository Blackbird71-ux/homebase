import type { DashboardData } from '@/types'
import { UpcomingEventsCard } from './UpcomingEventsCard'
import { TonightsDinnerCard } from './TonightsDinnerCard'
import { ShoppingListCard } from './ShoppingListCard'
import { TodoCard } from './TodoCard'

export function DashboardGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 h-full min-h-0">
      <UpcomingEventsCard events={data.upcomingEvents} />
      <TonightsDinnerCard dinner={data.tonightsDinner} />
      <ShoppingListCard list={data.shoppingList} />
      <TodoCard todo={data.todoSummary} />
    </div>
  )
}
