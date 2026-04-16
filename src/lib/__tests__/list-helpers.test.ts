import { describe, it, expect } from 'vitest'
import { groupByCategory, filterTodoItems } from '@/lib/list-helpers'
import type { ListItemShape } from '@/lib/list-helpers'

function makeItem(overrides: Partial<ListItemShape> = {}): ListItemShape {
  return {
    id: 'item1',
    content: 'Milk',
    isCompleted: false,
    category: null,
    sortOrder: 0,
    dueDate: null,
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

  it('sorts completed items after incomplete within a category', () => {
    const items = [
      makeItem({ id: '1', category: 'Dairy', isCompleted: true, sortOrder: 0 }),
      makeItem({ id: '2', category: 'Dairy', isCompleted: false, sortOrder: 1 }),
    ]
    const groups = groupByCategory(items)
    expect(groups.Dairy[0].isCompleted).toBe(false)
    expect(groups.Dairy[1].isCompleted).toBe(true)
  })

  it('places unknown category string into Other', () => {
    const items = [makeItem({ id: '1', category: 'WeirdCategory' })]
    const groups = groupByCategory(items)
    expect(groups.Other).toHaveLength(1)
  })
})

describe('filterTodoItems', () => {
  const now = new Date('2026-04-16T12:00:00Z')
  const todayStart = new Date('2026-04-16T00:00:00Z')
  const yesterday = new Date('2026-04-15T10:00:00Z')
  const tomorrow = new Date('2026-04-17T10:00:00Z')

  it('all filter returns all items sorted by dueDate asc', () => {
    const items = [
      makeItem({ id: '1', dueDate: tomorrow }),
      makeItem({ id: '2', dueDate: yesterday }),
      makeItem({ id: '3', dueDate: todayStart }),
    ]
    const result = filterTodoItems(items, 'all', now)
    expect(result.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('today filter returns only items due today', () => {
    const items = [
      makeItem({ id: '1', dueDate: todayStart }),
      makeItem({ id: '2', dueDate: yesterday }),
      makeItem({ id: '3', dueDate: tomorrow }),
      makeItem({ id: '4', dueDate: null }),
    ]
    const result = filterTodoItems(items, 'today', now)
    expect(result.map((i) => i.id)).toEqual(['1'])
  })

  it('overdue filter returns only non-completed items past due', () => {
    const items = [
      makeItem({ id: '1', dueDate: yesterday, isCompleted: false }),
      makeItem({ id: '2', dueDate: yesterday, isCompleted: true }),
      makeItem({ id: '3', dueDate: todayStart }),
    ]
    const result = filterTodoItems(items, 'overdue', now)
    expect(result.map((i) => i.id)).toEqual(['1'])
  })

  it('null dueDate items sort after dated items in all filter', () => {
    const items = [
      makeItem({ id: '1', dueDate: null, sortOrder: 0 }),
      makeItem({ id: '2', dueDate: tomorrow }),
    ]
    const result = filterTodoItems(items, 'all', now)
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })

  it('completed items sort after incomplete in all filter', () => {
    const items = [
      makeItem({ id: '1', isCompleted: true, dueDate: yesterday }),
      makeItem({ id: '2', isCompleted: false, dueDate: tomorrow }),
    ]
    const result = filterTodoItems(items, 'all', now)
    expect(result[0].isCompleted).toBe(false)
    expect(result[1].isCompleted).toBe(true)
  })
})
