export interface DashboardCardLayout {
  /** Percentage-based left position (0-100) */
  x: number
  /** Top position in pixels */
  y: number
  /** Percentage-based width (25-100) */
  width: number
  /** Height in pixels, or 'auto' */
  height: number | 'auto'
}

export interface DashboardCardConfig {
  id: string
  visible: boolean
  order: number
  /** Free-form layout position and size */
  layout?: DashboardCardLayout
  /** Per-card display option (see DashboardCardDefinition.variants) */
  variant?: string
}

export interface DashboardCardVariant {
  value: string
  label: string
}

export interface DashboardCardDefinition {
  id: string
  label: string
  defaultVisible: boolean
  /** Selectable display options; the first is the default */
  variants?: DashboardCardVariant[]
}

export const DASHBOARD_CARDS: DashboardCardDefinition[] = [
  { id: 'weekly-summary',    label: 'Weekly Summary',   defaultVisible: true,
    variants: [{ value: 'default', label: 'Meals: whole period' }, { value: 'today-tomorrow', label: 'Meals: today & tomorrow' }] },
  { id: 'chore-schedule',     label: 'Chore Schedule',   defaultVisible: true,
    variants: [{ value: 'default', label: 'Full schedule' }, { value: 'overdue-today', label: 'Overdue + today only' }] },
  { id: 'todo-summary',      label: 'To-Do Summary',    defaultVisible: true  },
  { id: 'upcoming-events',   label: 'Upcoming Events',  defaultVisible: true  },
  { id: 'todays-meals',      label: "Today's Meals",    defaultVisible: true  },
  { id: 'tomorrows-meals',   label: "Tomorrow's Meals", defaultVisible: false },
  { id: 'shopping-list',     label: 'Shopping List',    defaultVisible: true  },
  { id: 'bills-to-pay',     label: 'Bills to Pay',     defaultVisible: false },
  { id: 'upcoming-trips',   label: 'Upcoming Trips',   defaultVisible: true  },
  { id: 'pinned-notes',     label: 'Notes',            defaultVisible: false },
  { id: 'current-weather',  label: 'Current Weather',  defaultVisible: false },
  { id: 'calendar-week',    label: 'Next 7 Days',      defaultVisible: false },
  { id: 'sticky-note',      label: 'Family Sticky Note', defaultVisible: false },
  { id: 'sticky-note-personal', label: 'My Sticky Note', defaultVisible: false },
]

/** Resolve a card's selected variant, falling back to the card's first (default) variant. */
export function getCardVariant(card: DashboardCardConfig): string | undefined {
  const def = DASHBOARD_CARDS.find((d) => d.id === card.id)
  if (!def?.variants?.length) return undefined
  return def.variants.some((v) => v.value === card.variant) ? card.variant : def.variants[0].value
}

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

  const result: DashboardCardConfig[] = []
  const seen = new Set<string>()

  // First, add saved cards in their saved order, preserving layout
  for (const card of saved) {
    result.push({
      id: card.id,
      visible: card.visible,
      order: result.length,
      ...(card.layout ? { layout: { ...card.layout } } : {}),
      ...(card.variant ? { variant: card.variant } : {}),
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