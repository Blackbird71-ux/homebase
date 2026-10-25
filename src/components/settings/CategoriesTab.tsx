'use client'

import { useState } from 'react'
import { PillNav } from '@/components/shared/PillNav'
import { ShoppingCart, ListChecks, CalendarDays, Soup } from 'lucide-react'
import { CategoryManager } from '@/components/categories/CategoryManager'
import { ListCategoryManager } from '@/components/lists/ListCategoryManager'
import { EventCategoryManager } from '@/components/calendar/EventCategoryManager'
import { IngredientMappingsTab } from '@/components/settings/IngredientMappingsTab'

const SUB_TABS = [
  { id: 'meal-shopping', label: 'Meals & Shopping',    icon: ShoppingCart },
  { id: 'lists',         label: 'Lists',               icon: ListChecks },
  { id: 'events',        label: 'Events',              icon: CalendarDays },
  { id: 'mappings',      label: 'Ingredient Mappings', icon: Soup },
] as const

type SubTabId = (typeof SUB_TABS)[number]['id']

export function CategoriesTab() {
  const [active, setActive] = useState<SubTabId>('meal-shopping')

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto pb-1">
        <PillNav items={[...SUB_TABS]} active={active} onChange={(id) => setActive(id as SubTabId)} size="sm" />
      </div>
      {active === 'meal-shopping' && <CategoryManager />}
      {active === 'lists'         && <ListCategoryManager />}
      {active === 'events'        && <EventCategoryManager />}
      {active === 'mappings'      && <IngredientMappingsTab />}
    </div>
  )
}
