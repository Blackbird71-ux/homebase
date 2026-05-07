export interface DashboardCardConfig {
  id: string
  visible: boolean
  order: number
}

export interface DashboardCardDefinition {
  id: string
  label: string
  defaultVisible: boolean
}

export const DASHBOARD_CARDS: DashboardCardDefinition[] = [
  { id: 'weekly-summary',    label: 'Weekly Summary',   defaultVisible: true  },
  { id: 'chore-schedule',     label: 'Chore Schedule',   defaultVisible: true  },
  { id: 'upcoming-events',   label: 'Upcoming Events',  defaultVisible: true  },
  { id: 'todays-meals',      label: "Today's Meals",    defaultVisible: true  },
  { id: 'tomorrows-meals',   label: "Tomorrow's Meals", defaultVisible: true  },
  { id: 'shopping-list',     label: 'Shopping List',    defaultVisible: true  },
  { id: 'todo-summary',      label: 'To-Do Summary',    defaultVisible: true  },
]

/**
 * Merge a user's saved dashboardCards preferences with the default registry.
 * Returns an ordered array of card configs, with any missing cards appended
 * at the end with their default visibility.
 */
export function mergeDashboardCards(
  saved: DashboardCardConfig[] | null | undefined
): DashboardCardConfig[] {
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return DASHBOARD_CARDS.map((card, i) => ({
      id: card.id,
      visible: card.defaultVisible,
      order: i,
    }))
  }

  const savedMap = new Map(saved.map((c) => [c.id, c]))
  const result: DashboardCardConfig[] = []
  const seen = new Set<string>()

  // First, add saved cards in their saved order
  for (const card of saved) {
    result.push({
      id: card.id,
      visible: card.visible,
      order: result.length,
    })
    seen.add(card.id)
  }

  // Then append any cards from the registry that weren't in saved prefs
  for (const def of DASHBOARD_CARDS) {
    if (!seen.has(def.id)) {
      result.push({
        id: def.id,
        visible: def.defaultVisible,
        order: result.length,
      })
    }
  }

  return result
}
