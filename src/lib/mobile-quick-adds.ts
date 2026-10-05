// Per-user choice and order of the mobile + sheet's Quick Add actions.
// Pure and client-safe (no prisma/server imports) — stored in uiPreferences.mobileQuickAdds.
// Unset (null) means "show every action in the default order".

export const QUICK_ADD_IDS = [
  'event', 'chore', 'expense', 'list-item', 'shopping-list', 'todo-list',
  'recipe', 'meal', 'note', 'pantry-item', 'ai', 'help',
] as const

export type QuickAddId = (typeof QUICK_ADD_IDS)[number]

/** Lenient parse: keeps known, unique ids in order. Non-arrays mean "not customised" (null). */
export function normalizeQuickAdds(raw: unknown): QuickAddId[] | null {
  if (!Array.isArray(raw)) return null
  const known = new Set<string>(QUICK_ADD_IDS)
  const seen = new Set<string>()
  const ids: QuickAddId[] = []
  for (const v of raw) {
    if (typeof v !== 'string' || !known.has(v) || seen.has(v)) continue
    seen.add(v)
    ids.push(v as QuickAddId)
  }
  return ids
}

/**
 * Splits the full action list into what shows up-front and what sits under "More".
 * Not customised: everything is shown. Customised: the chosen ones (in chosen order) are
 * shown and the remainder go under "More", so no action ever becomes unreachable.
 */
export function splitQuickAdds<T extends { id: string }>(all: T[], chosen: QuickAddId[] | null): { shown: T[]; more: T[] } {
  if (chosen === null) return { shown: all, more: [] }
  const byId = new Map(all.map((a) => [a.id, a]))
  const shown = chosen.flatMap((id) => byId.get(id) ?? [])
  const chosenSet = new Set<string>(chosen)
  return { shown, more: all.filter((a) => !chosenSet.has(a.id)) }
}
