process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { groupByCategory, groupByRecipe, filterTodoItems } from '@/lib/list-helpers'
import type { ListItemShape } from '@/lib/list-helpers'

function makeItem(overrides: Partial<ListItemShape> = {}): ListItemShape {
  return {
    id: 'item1',
    content: 'Milk',
    isCompleted: false,
    category: null,
    sortOrder: 0,
    dueDate: null,
    recipeId: null,
    recipeName: null,
    createdBy: 'user1',
    listId: 'list1',
    createdAt: new Date('2026-04-16T00:00:00Z'),
    ...overrides,
  }
}

describe('groupByCategory', () => {
  it('places items with null category into Other', () => {
    const items = [makeItem({ id: '1', category: null })]
    const groups = groupByCategory(items)
    expect(groups.Other).toHaveLength(1)
    expect(groups.Produce).toHaveLength(0)
  })

  it('places items with known category into correct bucket', () => {
    const items = [
      makeItem({ id: '1', category: 'Dairy' }),
      makeItem({ id: '2', category: 'Produce' }),
    ]
    const groups = groupByCategory(items)
    expect(groups.Dairy).toHaveLength(1)
    expect(groups.Produce).toHaveLength(1)
  })

  it('excludes completed items from category buckets', () => {
    const items = [
      makeItem({ id: '1', category: 'Dairy', isCompleted: true }),
      makeItem({ id: '2', category: 'Dairy', isCompleted: false }),
    ]
    const groups = groupByCategory(items)
    expect(groups.Dairy).toHaveLength(1)
    expect(groups.Dairy[0].id).toBe('2')
  })

  it('places unknown category string into Other', () => {
    const items = [makeItem({ id: '1', category: 'WeirdCategory' })]
    const groups = groupByCategory(items)
    expect(groups.Other).toHaveLength(1)
  })

  it('sorts items by sortOrder within a category', () => {
    const items = [
      makeItem({ id: '1', category: 'Dairy', sortOrder: 2 }),
      makeItem({ id: '2', category: 'Dairy', sortOrder: 0 }),
      makeItem({ id: '3', category: 'Dairy', sortOrder: 1 }),
    ]
    const groups = groupByCategory(items)
    expect(groups.Dairy.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('respects custom categoryOrder for key ordering (items still go in correct bucket)', () => {
    const items = [
      makeItem({ id: '1', category: 'Dairy' }),
      makeItem({ id: '2', category: 'Produce' }),
    ]
    const groups = groupByCategory(items, ['Dairy', 'Produce'])
    expect(groups.Dairy).toHaveLength(1)
    expect(groups.Produce).toHaveLength(1)
  })
})

describe('groupByRecipe', () => {
  it('groups items by recipeName', () => {
    const items = [
      makeItem({ id: '1', recipeName: 'Pasta Bake', content: 'Tomatoes' }),
      makeItem({ id: '2', recipeName: 'Pasta Bake', content: 'Onion' }),
      makeItem({ id: '3', recipeName: null, content: 'Milk' }),
    ]
    const groups = groupByRecipe(items)
    expect(groups).toHaveLength(2)
    const pastaBake = groups.find((g) => g.name === 'Pasta Bake')
    const other = groups.find((g) => g.name === 'Other')
    expect(pastaBake?.items).toHaveLength(2)
    expect(other?.items).toHaveLength(1)
  })

  it('puts Other group last', () => {
    const items = [
      makeItem({ id: '1', recipeName: null }),
      makeItem({ id: '2', recipeName: 'Apple Crumble' }),
    ]
    const groups = groupByRecipe(items)
    expect(groups[groups.length - 1].name).toBe('Other')
  })

  it('sorts recipe groups alphabetically', () => {
    const items = [
      makeItem({ id: '1', recipeName: 'Zucchini Soup' }),
      makeItem({ id: '2', recipeName: 'Apple Crumble' }),
    ]
    const groups = groupByRecipe(items)
    const names = groups.filter((g) => g.name !== 'Other').map((g) => g.name)
    expect(names).toEqual(['Apple Crumble', 'Zucchini Soup'])
  })

  it('excludes completed items', () => {
    const items = [
      makeItem({ id: '1', recipeName: 'Pasta Bake', isCompleted: true }),
      makeItem({ id: '2', recipeName: 'Pasta Bake', isCompleted: false }),
    ]
    const groups = groupByRecipe(items)
    const pastaBake = groups.find((g) => g.name === 'Pasta Bake')
    expect(pastaBake?.items).toHaveLength(1)
  })
})

describe('filterTodoItems', () => {
  const now = new Date('2026-04-16T12:00:00Z')
  const todayStart = new Date('2026-04-16T00:00:00Z')
  const yesterday = new Date('2026-04-15T10:00:00Z')
  const tomorrow = new Date('2026-04-17T10:00:00Z')

  it('returns all items when filter is all', () => {
    const items = [
      makeItem({ id: '1', isCompleted: false }),
      makeItem({ id: '2', isCompleted: true }),
    ]
    expect(filterTodoItems(items, 'all', now)).toHaveLength(2)
  })

  it('returns only todays incomplete items when filter is today', () => {
    const items = [
      makeItem({ id: '1', dueDate: todayStart }),
      makeItem({ id: '2', dueDate: yesterday }),
      makeItem({ id: '3', dueDate: tomorrow }),
    ]
    const result = filterTodoItems(items, 'today', now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('returns overdue incomplete items when filter is overdue', () => {
    const items = [
      makeItem({ id: '1', dueDate: yesterday }),
      makeItem({ id: '2', dueDate: todayStart }),
      makeItem({ id: '3', dueDate: yesterday, isCompleted: true }),
    ]
    const result = filterTodoItems(items, 'overdue', now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})
