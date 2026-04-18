# Shopping List UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four UX improvements to the shopping list: completed items collapse to a "Done" section at the bottom, recipe-sourced items show a pill badge, a view toggle switches between "By Aisle" and "By Recipe", and drag handles let users reorder both category groups and items.

**Architecture:** Add `recipeId`/`recipeName` fields to `ListItem` and `categoryOrder` to `List` in Prisma, install dnd-kit for drag-and-drop, and split the ShoppingList into focused sub-components (CategoryGroup, DoneSection). A new AddToListDialog on the recipe detail page is the entry point for linking items to recipes.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + SQLite, @dnd-kit/core + @dnd-kit/sortable, Tailwind v4, shadcn/ui, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add recipeId, recipeName to ListItem; categoryOrder to List |
| `src/lib/list-helpers.ts` | Modify | Update ListItemShape; groupByCategory excludes completed; add groupByRecipe |
| `src/lib/__tests__/list-helpers.test.ts` | Modify | Update + add tests for new behaviour |
| `src/app/api/lists/[id]/items/route.ts` | Modify | POST accepts recipeId, recipeName |
| `src/app/api/lists/[id]/category-order/route.ts` | Create | PATCH updates List.categoryOrder |
| `src/app/api/lists/[id]/items/reorder/route.ts` | Create | PATCH bulk-updates ListItem.sortOrder |
| `src/app/(app)/lists/page.tsx` | Modify | Include categoryOrder in serialized list |
| `src/app/(app)/lists/ListsClient.tsx` | Modify | Add categoryOrder/recipeId/recipeName to interfaces; pass to ShoppingList |
| `src/components/lists/ListItemRow.tsx` | Modify | Add recipeName prop (pill badge) |
| `src/components/lists/CategoryGroup.tsx` | Create | Sortable category wrapper with drag handle header + sortable items |
| `src/components/lists/DoneSection.tsx` | Create | Fixed bottom section rendering completed items |
| `src/components/lists/ShoppingList.tsx` | Modify | View toggle, DndContext, categoryOrder state, DoneSection |
| `src/components/lists/AddToListDialog.tsx` | Create | Dialog to add recipe ingredients to a shopping list |
| `src/app/(app)/recipes/[id]/RecipeDetail.tsx` | Modify | "Add to shopping list" button that opens AddToListDialog |

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to schema**

Open `prisma/schema.prisma` and update the `List` and `ListItem` models:

```prisma
model List {
  id            String     @id @default(cuid())
  name          String
  type          String
  isActive      Boolean    @default(true)
  categoryOrder String?
  items         ListItem[]
  familyId      String
  family        Family     @relation(fields: [familyId], references: [id])
  createdAt     DateTime   @default(now())
}

model ListItem {
  id          String    @id @default(cuid())
  content     String
  isCompleted Boolean   @default(false)
  category    String?
  sortOrder   Int       @default(0)
  dueDate     DateTime?
  recipeId    String?
  recipeName  String?
  createdBy   String
  listId      String
  list        List      @relation(fields: [listId], references: [id])
  createdAt   DateTime  @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd "c:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx prisma migrate dev --name add_shopping_ux_fields
```

Expected: migration created and applied, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add recipeId, recipeName, categoryOrder fields for shopping list UX"
```

---

## Task 2: Update list-helpers (pure functions + tests)

**Files:**
- Modify: `src/lib/list-helpers.ts`
- Modify: `src/lib/__tests__/list-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the entire test file `src/lib/__tests__/list-helpers.test.ts` with:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "c:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run src/lib/__tests__/list-helpers.test.ts
```

Expected: failures on `groupByRecipe` (not defined), `groupByCategory` excludes completed (current impl includes them), `ListItemShape` missing recipeId/recipeName.

- [ ] **Step 3: Update list-helpers.ts**

Replace the entire file `src/lib/list-helpers.ts`:

```typescript
export type ShoppingCategory =
  | 'Produce'
  | 'Dairy'
  | 'Meat'
  | 'Bakery'
  | 'Frozen'
  | 'Household'
  | 'Other'

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Bakery',
  'Frozen',
  'Household',
  'Other',
]

export interface ListItemShape {
  id: string
  content: string
  isCompleted: boolean
  category: string | null
  sortOrder: number
  dueDate: Date | null
  recipeId: string | null
  recipeName: string | null
  createdBy: string
  listId: string
  createdAt: Date
}

export interface RecipeGroup {
  name: string
  items: ListItemShape[]
}

/**
 * Group incomplete shopping items by category, sorted by sortOrder within each group.
 * Completed items are excluded — callers handle them separately (DoneSection).
 * categoryOrder controls the order of buckets; defaults to SHOPPING_CATEGORIES.
 */
export function groupByCategory(
  items: ListItemShape[],
  categoryOrder: string[] = SHOPPING_CATEGORIES
): Record<ShoppingCategory, ListItemShape[]> {
  const result: Record<ShoppingCategory, ListItemShape[]> = {
    Produce: [],
    Dairy: [],
    Meat: [],
    Bakery: [],
    Frozen: [],
    Household: [],
    Other: [],
  }
  for (const item of items) {
    if (item.isCompleted) continue
    const cat = (item.category as ShoppingCategory) ?? 'Other'
    const key: ShoppingCategory = result[cat] !== undefined ? cat : 'Other'
    result[key].push(item)
  }
  for (const cat of SHOPPING_CATEGORIES) {
    result[cat].sort((a, b) => a.sortOrder - b.sortOrder)
  }
  // categoryOrder param is used by ShoppingList to determine render order;
  // groupByCategory just populates buckets.
  void categoryOrder
  return result
}

/**
 * Group incomplete shopping items by recipe name.
 * Items without a recipeName go in "Other". Recipe groups sorted alphabetically, Other last.
 */
export function groupByRecipe(items: ListItemShape[]): RecipeGroup[] {
  const map = new Map<string, ListItemShape[]>()
  for (const item of items) {
    if (item.isCompleted) continue
    const key = item.recipeName ?? 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  const groups: RecipeGroup[] = []
  const sortedKeys = Array.from(map.keys())
    .filter((k) => k !== 'Other')
    .sort((a, b) => a.localeCompare(b))
  for (const key of sortedKeys) {
    groups.push({ name: key, items: map.get(key)! })
  }
  if (map.has('Other')) {
    groups.push({ name: 'Other', items: map.get('Other')! })
  }
  return groups
}

export type TodoFilter = 'all' | 'today' | 'overdue'

/** Filter and sort todo items. */
export function filterTodoItems(
  items: ListItemShape[],
  filter: TodoFilter,
  now: Date = new Date()
): ListItemShape[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  let filtered = items
  if (filter === 'today') {
    filtered = items.filter(
      (i) =>
        !i.isCompleted &&
        i.dueDate !== null &&
        i.dueDate >= todayStart &&
        i.dueDate < todayEnd
    )
  } else if (filter === 'overdue') {
    filtered = items.filter(
      (i) => !i.isCompleted && i.dueDate !== null && i.dueDate < todayStart
    )
  }

  return filtered.slice().sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
    if (a.dueDate === null && b.dueDate === null) return a.sortOrder - b.sortOrder
    if (a.dueDate === null) return 1
    if (b.dueDate === null) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/__tests__/list-helpers.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/list-helpers.ts src/lib/__tests__/list-helpers.test.ts
git commit -m "feat: update list-helpers — completed items excluded from groups, add groupByRecipe"
```

---

## Task 3: Update items POST to accept recipeId/recipeName

**Files:**
- Modify: `src/app/api/lists/[id]/items/route.ts`

- [ ] **Step 1: Update the POST handler**

Replace the entire file `src/app/api/lists/[id]/items/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(list.items)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { content, category, dueDate, sortOrder, recipeId, recipeName } = body

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const parsed = dueDate ? new Date(dueDate) : null
  if (parsed !== null && isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'dueDate is not a valid ISO date' }, { status: 400 })
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.listItem.create({
    data: {
      content,
      category: category ?? null,
      dueDate: parsed,
      sortOrder: sortOrder ?? 0,
      recipeId: recipeId ?? null,
      recipeName: recipeName ?? null,
      createdBy: user.id,
      listId: id,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/lists/[id]/items/route.ts"
git commit -m "feat: items POST accepts recipeId and recipeName"
```

---

## Task 4: Add PATCH /api/lists/[id]/category-order

**Files:**
- Create: `src/app/api/lists/[id]/category-order/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/lists/[id]/category-order/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { categoryOrder } = body

  if (!Array.isArray(categoryOrder)) {
    return NextResponse.json({ error: 'categoryOrder must be an array' }, { status: 400 })
  }

  const valid = new Set<string>(SHOPPING_CATEGORIES)
  const invalid = (categoryOrder as string[]).filter((c) => !valid.has(c))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown categories: ${invalid.join(', ')}` },
      { status: 400 }
    )
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.list.update({
    where: { id },
    data: { categoryOrder: JSON.stringify(categoryOrder as ShoppingCategory[]) },
  })
  return NextResponse.json(updated)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/lists/[id]/category-order/route.ts"
git commit -m "feat: add PATCH /api/lists/[id]/category-order endpoint"
```

---

## Task 5: Add PATCH /api/lists/[id]/items/reorder

**Files:**
- Create: `src/app/api/lists/[id]/items/reorder/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/lists/[id]/items/reorder/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }

  for (const item of items) {
    if (typeof item.id !== 'string' || typeof item.sortOrder !== 'number') {
      return NextResponse.json(
        { error: 'each item must have id (string) and sortOrder (number)' },
        { status: 400 }
      )
    }
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify all items belong to this list
  const ids = (items as { id: string; sortOrder: number }[]).map((i) => i.id)
  const owned = await prisma.listItem.findMany({
    where: { id: { in: ids }, listId: id },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Some items not found in this list' }, { status: 404 })
  }

  await prisma.$transaction(
    (items as { id: string; sortOrder: number }[]).map(({ id: itemId, sortOrder }) =>
      prisma.listItem.update({ where: { id: itemId }, data: { sortOrder } })
    )
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/lists/[id]/items/reorder/route.ts"
git commit -m "feat: add PATCH /api/lists/[id]/items/reorder endpoint"
```

---

## Task 6: Install dnd-kit + create CategoryGroup and DoneSection

**Files:**
- Create: `src/components/lists/CategoryGroup.tsx`
- Create: `src/components/lists/DoneSection.tsx`

- [ ] **Step 1: Install dnd-kit**

```bash
cd "c:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to package.json and node_modules.

- [ ] **Step 2: Create DoneSection.tsx**

Create `src/components/lists/DoneSection.tsx`:

```typescript
'use client'

import { ListItemRow } from './ListItemRow'
import type { ListItemShape } from '@/lib/list-helpers'

interface DoneSectionProps {
  items: ListItemShape[]
  listId: string
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

export function DoneSection({ items, onToggle, onDelete }: DoneSectionProps) {
  if (items.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        Done
      </p>
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <ListItemRow
            key={item.id}
            id={item.id}
            content={item.content}
            isCompleted={item.isCompleted}
            recipeName={item.recipeName}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CategoryGroup.tsx**

Create `src/components/lists/CategoryGroup.tsx`:

```typescript
'use client'

import { GripVerticalIcon } from 'lucide-react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ListItemRow } from './ListItemRow'
import type { ListItemShape } from '@/lib/list-helpers'

interface SortableItemProps {
  item: ListItemShape
  showDragHandle: boolean
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

function SortableItem({ item, showDragHandle, onToggle, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: 'item', category: item.category } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {showDragHandle && (
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/30 hover:text-muted-foreground focus:outline-none shrink-0"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVerticalIcon className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <ListItemRow
          id={item.id}
          content={item.content}
          isCompleted={item.isCompleted}
          recipeName={item.recipeName}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

interface CategoryGroupProps {
  category: string
  items: ListItemShape[]
  showDragHandle: boolean
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

export function CategoryGroup({
  category,
  items,
  showDragHandle,
  onToggle,
  onDelete,
}: CategoryGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category, data: { type: 'category' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1 mb-1">
        {showDragHandle && (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground focus:outline-none shrink-0"
            aria-label={`Drag ${category} category`}
            tabIndex={-1}
          >
            <GripVerticalIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {category}
        </p>
      </div>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              showDragHandle={showDragHandle}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (ListItemRow.tsx will need updating in the next task, but that's OK — check for dnd-kit type errors only here).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/lists/CategoryGroup.tsx src/components/lists/DoneSection.tsx
git commit -m "feat: install dnd-kit, add CategoryGroup and DoneSection components"
```

---

## Task 7: Update ListItemRow with pill badge

**Files:**
- Modify: `src/components/lists/ListItemRow.tsx`

- [ ] **Step 1: Update ListItemRow**

Replace the entire file `src/components/lists/ListItemRow.tsx`:

```typescript
'use client'

import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ListItemRowProps {
  id: string
  content: string
  isCompleted: boolean
  dueDate?: string | null
  recipeName?: string | null
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

export function ListItemRow({
  id,
  content,
  isCompleted,
  dueDate,
  recipeName,
  onToggle,
  onDelete,
}: ListItemRowProps) {
  const dueDateObj = dueDate ? new Date(dueDate) : null
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isOverdue =
    dueDateObj !== null && !isCompleted && dueDateObj < todayStart

  return (
    <div
      className={`flex items-center gap-2 py-2 px-1 rounded-md group ${
        isCompleted ? 'opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
        aria-label={`Mark "${content}" ${isCompleted ? 'incomplete' : 'complete'}`}
      />
      <span
        className={`flex-1 text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
      >
        {content}
      </span>
      {!isCompleted && recipeName && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
          {recipeName}
        </span>
      )}
      {dueDateObj && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
            isOverdue
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(id)}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Delete item"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/lists/ListItemRow.tsx
git commit -m "feat: add recipeName pill badge to ListItemRow"
```

---

## Task 8: Rewrite ShoppingList with view toggle, drag, and Done section

**Files:**
- Modify: `src/components/lists/ShoppingList.tsx`

- [ ] **Step 1: Replace ShoppingList.tsx**

Replace the entire file `src/components/lists/ShoppingList.tsx`:

```typescript
'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { groupByCategory, groupByRecipe, SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { CategoryGroup } from './CategoryGroup'
import { DoneSection } from './DoneSection'
import { ListItemRow } from './ListItemRow'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

type ViewMode = 'aisle' | 'recipe'

export function ShoppingList({ listId, initialItems, initialCategoryOrder }: ShoppingListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('aisle')
  const [categoryOrder, setCategoryOrder] = useState<string[]>(
    initialCategoryOrder ?? [...SHOPPING_CATEGORIES]
  )
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [, startTransition] = useTransition()

  const catSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const debouncedSaveCategoryOrder = useCallback(
    (order: string[]) => {
      if (catSaveTimer.current) clearTimeout(catSaveTimer.current)
      catSaveTimer.current = setTimeout(() => {
        fetch(`/api/lists/${listId}/category-order`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryOrder: order }),
        }).catch(() => toast.error('Failed to save category order.'))
      }, 500)
    },
    [listId]
  )

  const debouncedSaveItemOrder = useCallback(
    (updates: { id: string; sortOrder: number }[]) => {
      if (itemSaveTimer.current) clearTimeout(itemSaveTimer.current)
      itemSaveTimer.current = setTimeout(() => {
        fetch(`/api/lists/${listId}/items/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: updates }),
        }).catch(() => toast.error('Failed to save item order.'))
      }, 500)
    },
    [listId]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeType = active.data.current?.type as string | undefined

    if (activeType === 'category') {
      const oldIndex = categoryOrder.indexOf(active.id as string)
      const newIndex = categoryOrder.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(categoryOrder, oldIndex, newIndex)
      setCategoryOrder(newOrder)
      debouncedSaveCategoryOrder(newOrder)
    } else if (activeType === 'item') {
      const activeCategory = active.data.current?.category as string | null | undefined
      const catItems = items.filter(
        (i) => !i.isCompleted && i.category === activeCategory
      )
      const oldIndex = catItems.findIndex((i) => i.id === active.id)
      const newIndex = catItems.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(catItems, oldIndex, newIndex)
      const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }))
      setItems((prev) =>
        prev.map((i) => {
          const u = updates.find((x) => x.id === i.id)
          return u ? { ...i, sortOrder: u.sortOrder } : i
        })
      )
      debouncedSaveItemOrder(updates)
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent.trim(), category: newCategory }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems((prev) => [
        ...prev,
        {
          ...item,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          createdAt: new Date(item.createdAt),
          recipeId: item.recipeId ?? null,
          recipeName: item.recipeName ?? null,
        },
      ])
      setNewContent('')
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleItem(id: string, isCompleted: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      })
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isCompleted } : i)))
      } else {
        toast.error('Failed to save. Please try again.')
      }
    })
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function clearCompleted() {
    const res = await fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => !i.isCompleted))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  const completedItems = items.filter((i) => i.isCompleted)
  const grouped = groupByCategory(items)
  const recipeGroups = groupByRecipe(items)

  const activeCategoryOrder = categoryOrder.filter(
    (c) => SHOPPING_CATEGORIES.includes(c as ShoppingCategory)
  )

  return (
    <div className="flex flex-col gap-4">
      {/* View toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setViewMode('aisle')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'aisle'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Aisle
        </button>
        <button
          onClick={() => setViewMode('recipe')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'recipe'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Recipe
        </button>
      </div>

      {/* Add item form */}
      <form onSubmit={addItem} className="flex gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add item..."
          className="flex-1"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as ShoppingCategory)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {SHOPPING_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Button type="submit" size="sm">
          <PlusIcon className="h-4 w-4" />
        </Button>
      </form>

      {completedItems.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCompleted}
          className="self-end text-muted-foreground"
        >
          Clear {completedItems.length} completed
        </Button>
      )}

      {/* Items */}
      {viewMode === 'aisle' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeCategoryOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {activeCategoryOrder.map((cat) => {
                const catItems = grouped[cat as ShoppingCategory] ?? []
                if (catItems.length === 0) return null
                return (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    items={catItems}
                    showDragHandle={true}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                  />
                )
              })}
            </div>
          </SortableContext>
          <DoneSection
            items={completedItems}
            listId={listId}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        </DndContext>
      ) : (
        <div className="flex flex-col gap-4">
          {recipeGroups.map((group) => (
            <div key={group.name}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {group.name}
              </p>
              <div className="divide-y divide-border/50">
                {group.items.map((item) => (
                  <ListItemRow
                    key={item.id}
                    id={item.id}
                    content={item.content}
                    isCompleted={item.isCompleted}
                    recipeName={item.recipeName}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                  />
                ))}
              </div>
            </div>
          ))}
          <DoneSection
            items={completedItems}
            listId={listId}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/lists/ShoppingList.tsx
git commit -m "feat: rewrite ShoppingList with view toggle, drag-to-reorder, and Done section"
```

---

## Task 9: Update ListsClient and lists page to pass categoryOrder

**Files:**
- Modify: `src/app/(app)/lists/ListsClient.tsx`
- Modify: `src/app/(app)/lists/page.tsx`

- [ ] **Step 1: Update ListsClient.tsx**

Replace the entire file `src/app/(app)/lists/ListsClient.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ListSelector } from '@/components/lists/ListSelector'
import { ShoppingList } from '@/components/lists/ShoppingList'
import { TodoList } from '@/components/lists/TodoList'
import { NewListDialog } from '@/components/lists/NewListDialog'
import type { ListItemShape } from '@/lib/list-helpers'

interface SerializedItem {
  id: string
  content: string
  isCompleted: boolean
  category: string | null
  sortOrder: number
  dueDate: string | null
  recipeId: string | null
  recipeName: string | null
  createdBy: string
  listId: string
  createdAt: string
}

interface SerializedList {
  id: string
  name: string
  type: string
  isActive: boolean
  categoryOrder: string | null
  createdAt: string
  familyId: string
  items: SerializedItem[]
  _count: { items: number }
}

function toListItemShape(item: SerializedItem): ListItemShape {
  return {
    ...item,
    dueDate: item.dueDate ? new Date(item.dueDate) : null,
    createdAt: new Date(item.createdAt),
  }
}

interface ListsClientProps {
  initialLists: SerializedList[]
}

export function ListsClient({ initialLists }: ListsClientProps) {
  const [lists, setLists] = useState<SerializedList[]>(initialLists)
  const [activeListId, setActiveListId] = useState<string | null>(
    initialLists[0]?.id ?? null
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeList = lists.find((l) => l.id === activeListId) ?? null

  function handleCreated(list: { id: string; name: string; type: string }) {
    const familyId = initialLists[0]?.familyId ?? ''
    const newList: SerializedList = {
      ...list,
      isActive: true,
      categoryOrder: null,
      createdAt: new Date().toISOString(),
      familyId,
      items: [],
      _count: { items: 0 },
    }
    setLists((prev) => [...prev, newList])
    setActiveListId(list.id)
  }

  async function handleDeleteList(id: string) {
    const list = lists.find((l) => l.id === id)
    if (!list) return
    if (!confirm(`Delete "${list.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== id))
      if (activeListId === id) setActiveListId(lists.find((l) => l.id !== id)?.id ?? null)
    }
  }

  const listsMeta = lists.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type as 'SHOPPING' | 'TODO',
    _count: l._count,
  }))

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-[200px] shrink-0 border-r border-border overflow-y-auto">
        <ListSelector
          lists={listsMeta}
          activeListId={activeListId}
          onSelect={setActiveListId}
          onNewList={() => setDialogOpen(true)}
          onDeleteList={handleDeleteList}
        />
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {activeList === null ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No lists yet. Create one to get started.</p>
          </div>
        ) : activeList.type === 'SHOPPING' ? (
          <>
            <h1 className="text-xl font-semibold mb-4">{activeList.name}</h1>
            <ShoppingList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
              initialCategoryOrder={
                activeList.categoryOrder ? JSON.parse(activeList.categoryOrder) : null
              }
            />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-4">{activeList.name}</h1>
            <TodoList
              key={activeList.id}
              listId={activeList.id}
              initialItems={activeList.items.map(toListItemShape)}
            />
          </>
        )}
      </main>

      <NewListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify the lists page still works (no changes needed)**

The lists page uses a spread (`...l`) so `categoryOrder` will automatically be included after the schema migration. Verify:

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/lists/ListsClient.tsx"
git commit -m "feat: pass categoryOrder through ListsClient to ShoppingList"
```

---

## Task 10: Create AddToListDialog and wire up RecipeDetail

**Files:**
- Create: `src/components/lists/AddToListDialog.tsx`
- Modify: `src/app/(app)/recipes/[id]/RecipeDetail.tsx`

- [ ] **Step 1: Create AddToListDialog.tsx**

Create `src/components/lists/AddToListDialog.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ShoppingListMeta {
  id: string
  name: string
  type: string
}

interface AddToListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipeId: string
  recipeName: string
  ingredients: string[]
}

export function AddToListDialog({
  open,
  onOpenChange,
  recipeId,
  recipeName,
  ingredients,
}: AddToListDialogProps) {
  const [lists, setLists] = useState<ShoppingListMeta[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetching(true)
    fetch('/api/lists')
      .then((r) => r.json())
      .then((data: ShoppingListMeta[]) => {
        const shopping = data.filter((l) => l.type === 'SHOPPING')
        setLists(shopping)
        if (shopping.length > 0) setSelectedListId(shopping[0].id)
        setSelected(new Set(ingredients.map((_, i) => i)))
      })
      .catch(() => toast.error('Failed to load shopping lists.'))
      .finally(() => setFetching(false))
  }, [open, ingredients])

  function toggleIngredient(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListId || selected.size === 0) return
    setLoading(true)
    try {
      const toAdd = ingredients.filter((_, i) => selected.has(i))
      const results = await Promise.all(
        toAdd.map((content) =>
          fetch(`/api/lists/${selectedListId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              category: 'Other',
              recipeId,
              recipeName,
            }),
          })
        )
      )
      const failed = results.filter((r) => !r.ok).length
      if (failed > 0) {
        toast.error(`${failed} item(s) failed to add.`)
      } else {
        toast.success(`${toAdd.length} ingredient(s) added to shopping list.`)
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to shopping list</DialogTitle>
        </DialogHeader>
        {fetching ? (
          <p className="text-sm text-muted-foreground py-4">Loading lists...</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No active shopping lists found. Create one on the Lists page first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Shopping list</label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Ingredients</label>
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto border border-border rounded-md p-2">
                {ingredients.map((ing, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleIngredient(idx)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {ing}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading || selected.size === 0}>
                {loading ? 'Adding...' : `Add ${selected.size} item${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Add "Add to shopping list" button to RecipeDetail.tsx**

Open `src/app/(app)/recipes/[id]/RecipeDetail.tsx`. At the top, add the import:

```typescript
import { AddToListDialog } from '@/components/lists/AddToListDialog'
import { ShoppingCartIcon } from 'lucide-react'
```

Inside the `RecipeDetail` function, add state after the existing `useState` calls:

```typescript
const [addToListOpen, setAddToListOpen] = useState(false)
```

In the JSX, find the buttons row (the row containing the Print and Edit buttons) and add the "Add to shopping list" button:

```typescript
<Button variant="outline" size="sm" onClick={() => setAddToListOpen(true)}>
  <ShoppingCartIcon className="h-4 w-4 mr-1" />
  Add to list
</Button>
```

Place this button in the `<div className="flex gap-2">` alongside the Print button.

At the bottom of the JSX (before the closing `</>` or `</div>`), add the dialog:

```typescript
<AddToListDialog
  open={addToListOpen}
  onOpenChange={setAddToListOpen}
  recipeId={recipe.id}
  recipeName={recipe.title}
  ingredients={recipe.ingredients}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/lists/AddToListDialog.tsx "src/app/(app)/recipes/[id]/RecipeDetail.tsx"
git commit -m "feat: add AddToListDialog and Add to shopping list button on recipe detail"
```

---

## Task 11: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
cd "c:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run
```

Expected: all tests pass (no failures).

- [ ] **Step 2: TypeScript full check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Start dev server and smoke-test**

```bash
npm run dev
```

Verify manually:
1. Open a shopping list — "By Aisle" tab shows items grouped by category with drag handles
2. Drag a category header to reorder categories — order persists on page reload
3. Drag an item within a category — order persists on page reload
4. Tick an item — it moves to "Done" section at the bottom immediately
5. Switch to "By Recipe" tab — items grouped by recipe name, no drag handles
6. Open a recipe detail page — "Add to list" button is visible
7. Click "Add to list" — dialog opens, shows shopping lists and ingredients
8. Select items and submit — toast appears, items appear in the shopping list with a recipe pill badge
9. Clear completed — "Done" section disappears

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: shopping list UX smoke-test fixes"
```

(Only run this step if fixes were required in step 3.)
