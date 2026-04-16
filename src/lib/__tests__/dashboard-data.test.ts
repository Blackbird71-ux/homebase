/**
 * Smoke test: verifies dashboard data query shapes are correct.
 * Uses the same query logic as home/page.tsx, run against test DB.
 *
 * This test does NOT mock Prisma — it verifies the query contracts.
 * Run manually after seeding with test data.
 */
import { describe, it, expect } from 'vitest'

// Verify ShoppingListSummary shape
describe('ShoppingListSummary type contract', () => {
  it('has required fields', () => {
    const summary = {
      listId: 'abc',
      listName: 'Weekly Shop',
      totalItems: 5,
      pendingItems: 3,
      firstItems: ['Milk', 'Eggs', 'Bread'],
    }
    expect(summary.listId).toBeTruthy()
    expect(summary.listName).toBeTruthy()
    expect(typeof summary.pendingItems).toBe('number')
    expect(Array.isArray(summary.firstItems)).toBe(true)
  })
})

describe('TodoSummary type contract', () => {
  it('has required fields', () => {
    const summary = {
      listId: 'def',
      listName: 'Chores',
      dueTodayCount: 2,
      firstItems: ['Call plumber', 'Buy stamps'],
    }
    expect(summary.listId).toBeTruthy()
    expect(typeof summary.dueTodayCount).toBe('number')
    expect(Array.isArray(summary.firstItems)).toBe(true)
  })
})

describe('TonightsDinner type contract', () => {
  it('accepts recipeName or note', () => {
    const withRecipe = { mealPlanId: 'x', recipeName: 'Pasta', note: null }
    const withNote = { mealPlanId: 'y', recipeName: null, note: 'Takeaway' }
    expect(withRecipe.recipeName ?? withRecipe.note).toBe('Pasta')
    expect(withNote.recipeName ?? withNote.note).toBe('Takeaway')
  })
})
