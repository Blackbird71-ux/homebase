/**
 * Simple cross-component event bus for notifying components of data changes.
 * Components can listen for events and refresh their data accordingly.
 */

export const AppEvents = {
  MEAL_PLAN_UPDATED: 'app:mealPlanUpdated',
  SHOPPING_LIST_UPDATED: 'app:shoppingListUpdated',
  TODO_LIST_UPDATED: 'app:todoListUpdated',
  NOTES_UPDATED: 'app:notesUpdated',
  CHORES_UPDATED: 'app:choresUpdated',
  CALENDAR_UPDATED: 'app:calendarUpdated',
} as const

export type AppEventName = (typeof AppEvents)[keyof typeof AppEvents]

/**
 * Dispatch a custom event that other components can listen for.
 * Use this after successful mutations from the AI assistant or other cross-cutting actions.
 */
export function dispatchAppEvent(eventName: AppEventName): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName))
}

/**
 * Subscribe to an app event. Returns a cleanup function.
 */
export function listenAppEvent(eventName: AppEventName, callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(eventName, callback)
  return () => window.removeEventListener(eventName, callback)
}
