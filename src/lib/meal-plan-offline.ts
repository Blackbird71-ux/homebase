/**
 * Offline queueing for meal-plan mutations (client-safe, no server imports).
 *
 * Every offline mutation is expressed as one of two replay units:
 *
 * - Whole-slot state: POST /api/meal-plan without `append` replaces the slot's
 *   recipes with exactly `recipeIds` and sets `note` — the upsert is keyed on
 *   (familyId, date, mealType), so replaying it is idempotent. Queued under a
 *   FIXED id per slot, so successive offline edits to the same slot collapse
 *   into one queue entry (IndexedDB put() overwrites on the same key).
 *
 * - Entry delete: DELETE /api/meal-plan/[id], also under a fixed per-slot id.
 *   The route 404s if the entry is gone, which the flusher drops as resolved.
 *
 * Fixed ids + queuedAt ordering give last-write-wins per slot per action type,
 * and the flusher's queuedAt sort replays the user's final intent (e.g. a
 * delete queued after a re-assign still lands last). Entries created offline
 * (`temp-` ids) were never on the server, so deleting one just cancels the
 * slot's queued POST instead of queueing a DELETE.
 *
 * Moves and per-recipe removals are translated by the callers into these two
 * units — the id-based /move and /recipe DELETE routes are never queued,
 * because their ids are unstable across replay.
 */
import { queueOfflineMutation, removeMutation, broadcastQueueCount } from './offline-queue'

/** Scope key used as `listId` so OFFLINE_QUEUE_FLUSHED can target the meal-plan page. */
export const MEAL_PLAN_SCOPE = 'meal-plan'

/** Optimistic entries created while offline (matches the drag-drop temp id convention). */
export function isTempEntryId(id: string): boolean {
  return id.startsWith('temp-')
}

const slotPostId = (date: string, mealType: string) => `mealplan_${date}_${mealType}`
const slotDeleteId = (date: string, mealType: string) => `mealplandel_${date}_${mealType}`

/** Queue the full desired state of one slot. `date` is a YYYY-MM-DD local calendar date. */
export async function queueMealPlanSlotState(
  date: string,
  mealType: string,
  recipeIds: string[],
  note: string | null,
): Promise<void> {
  await queueOfflineMutation({
    id: slotPostId(date, mealType),
    listId: MEAL_PLAN_SCOPE,
    queuedAt: Date.now(),
    endpoint: '/api/meal-plan',
    method: 'POST',
    // Meal plan dates are UTC midnight by convention (see AGENTS.md exception)
    body: { date: date + 'T00:00:00Z', mealType, recipeIds: [...new Set(recipeIds)], note },
  })
}

/**
 * Queue deletion of a slot's entry. For offline-created entries (temp- id)
 * there is nothing on the server — just cancel the slot's queued POST.
 */
export async function queueMealPlanSlotDelete(
  date: string,
  mealType: string,
  entryId: string,
): Promise<void> {
  if (isTempEntryId(entryId)) {
    try { await removeMutation(slotPostId(date, mealType)) } catch { /* IndexedDB unavailable */ }
    await broadcastQueueCount()
    return
  }
  await queueOfflineMutation({
    id: slotDeleteId(date, mealType),
    listId: MEAL_PLAN_SCOPE,
    queuedAt: Date.now(),
    endpoint: `/api/meal-plan/${entryId}`,
    method: 'DELETE',
  })
}
