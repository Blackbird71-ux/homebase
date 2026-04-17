# Groceries Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export to Groceries" button to the Meal Plan page that opens a modal showing the current week's recipe ingredients pre-categorised, lets the user fix any category (learning is persisted), and writes them to a Shopping list called "Groceries" in the Lists section.

**Architecture:** A new `IngredientCategory` DB table stores per-family `(key → category)` mappings where `key` is the ingredient text with quantities stripped and lowercased. A GET preview endpoint collects the week's ingredients and looks them up; a POST export endpoint upserts the learned mappings and writes items to the Groceries list. The UI is a single modal component wired into `MealPlanGrid`.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + better-sqlite3, NextAuth v5, Vitest, Tailwind v4, shadcn/ui Dialog + Button, sonner toasts.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `src/lib/ingredient-helpers.ts` |
| Create | `src/lib/__tests__/ingredient-helpers.test.ts` |
| Create | `src/app/api/meal-plan/export-preview/route.ts` |
| Create | `src/app/api/meal-plan/export-preview/__tests__/route.test.ts` |
| Create | `src/app/api/meal-plan/export-groceries/route.ts` |
| Create | `src/app/api/meal-plan/export-groceries/__tests__/route.test.ts` |
| Create | `src/components/meal-plan/ExportGroceriesModal.tsx` |
| Modify | `src/components/meal-plan/MealPlanGrid.tsx` |

---

## Task 1: Add IngredientCategory to Prisma schema and migrate

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model and relation to schema.prisma**

Open `prisma/schema.prisma`. Add `ingredientCategories IngredientCategory[]` to the `Family` model, then append the new model at the end of the file:

```prisma
// In the Family model, add this line alongside the other relations:
  ingredientCategories IngredientCategory[]

// At the end of the file:
model IngredientCategory {
  id        String   @id @default(cuid())
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  key       String
  category  String
  updatedAt DateTime @updatedAt

  @@unique([familyId, key])
}
```

The full `Family` model should look like:

```prisma
model Family {
  id                   String                @id @default(cuid())
  name                 String
  timezone             String                @default("Australia/Sydney")
  umamiScriptUrl       String?
  umamiSiteId          String?
  users                User[]
  events               Event[]
  lists                List[]
  recipes              Recipe[]
  mealPlans            MealPlan[]
  coziImports          CoziImport[]
  inviteCodes          InviteCode[]
  ingredientCategories IngredientCategory[]
}
```

- [ ] **Step 2: Run the migration**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
DATABASE_URL=file:./homebase.db npx prisma migrate dev --name add_ingredient_category
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify Prisma client generated correctly**

```bash
DATABASE_URL=file:./homebase.db npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add IngredientCategory schema for ingredient learning"
```

---

## Task 2: Ingredient helpers — normalise and auto-guess

**Files:**
- Create: `src/lib/ingredient-helpers.ts`
- Create: `src/lib/__tests__/ingredient-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/ingredient-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeIngredient, autoGuessCategory } from '@/lib/ingredient-helpers'

describe('normalizeIngredient', () => {
  it('strips leading number+unit (no space)', () => {
    expect(normalizeIngredient('500g beef mince')).toBe('beef mince')
  })

  it('strips leading number+unit (with space)', () => {
    expect(normalizeIngredient('2 cups chicken stock')).toBe('chicken stock')
  })

  it('strips bare leading number', () => {
    expect(normalizeIngredient('4 chicken thighs')).toBe('chicken thighs')
  })

  it('strips "cloves" as a unit word', () => {
    expect(normalizeIngredient('2 cloves garlic')).toBe('garlic')
  })

  it('leaves text-only ingredient unchanged', () => {
    expect(normalizeIngredient('olive oil')).toBe('olive oil')
  })

  it('lowercases the result', () => {
    expect(normalizeIngredient('Fresh Rosemary')).toBe('fresh rosemary')
  })

  it('trims whitespace', () => {
    expect(normalizeIngredient('  1 onion  ')).toBe('onion')
  })
})

describe('autoGuessCategory', () => {
  it('guesses Meat for chicken', () => {
    expect(autoGuessCategory('chicken thighs')).toBe('Meat')
  })

  it('guesses Meat for beef mince', () => {
    expect(autoGuessCategory('beef mince')).toBe('Meat')
  })

  it('guesses Dairy for parmesan', () => {
    expect(autoGuessCategory('parmesan to serve')).toBe('Dairy')
  })

  it('guesses Dairy for eggs', () => {
    expect(autoGuessCategory('eggs')).toBe('Dairy')
  })

  it('guesses Produce for garlic', () => {
    expect(autoGuessCategory('garlic')).toBe('Produce')
  })

  it('guesses Produce for onion', () => {
    expect(autoGuessCategory('onion')).toBe('Produce')
  })

  it('guesses Bakery for spaghetti', () => {
    expect(autoGuessCategory('spaghetti')).toBe('Bakery')
  })

  it('guesses Household for olive oil', () => {
    expect(autoGuessCategory('olive oil')).toBe('Household')
  })

  it('guesses Frozen for frozen peas', () => {
    expect(autoGuessCategory('frozen peas')).toBe('Frozen')
  })

  it('falls back to Other for unknown ingredient', () => {
    expect(autoGuessCategory('xanthan gum')).toBe('Other')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run src/lib/__tests__/ingredient-helpers.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '@/lib/ingredient-helpers'`.

- [ ] **Step 3: Implement ingredient-helpers.ts**

Create `src/lib/ingredient-helpers.ts`:

```typescript
import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'

export const KEYWORD_MAP: Record<ShoppingCategory, string[]> = {
  Meat:      ['chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'mince', 'bacon', 'turkey', 'duck', 'steak', 'sausage', 'ham', 'chorizo'],
  Dairy:     ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'cheddar', 'egg', 'ricotta', 'brie', 'feta'],
  Produce:   ['onion', 'garlic', 'tomato', 'lettuce', 'carrot', 'celery', 'lemon', 'lime', 'herb', 'rosemary', 'basil', 'thyme', 'parsley', 'spinach', 'capsicum', 'mushroom', 'potato', 'zucchini', 'broccoli', 'cucumber', 'avocado', 'ginger', 'apple', 'banana', 'orange'],
  Bakery:    ['bread', 'flour', 'pasta', 'spaghetti', 'crouton', 'noodle', 'rice', 'couscous', 'pita', 'tortilla', 'bun', 'roll', 'pastry'],
  Frozen:    ['frozen'],
  Household: ['oil', 'vinegar', 'sauce', 'stock', 'dressing', 'salt', 'pepper', 'sugar', 'honey', 'soy', 'mustard', 'ketchup', 'mayo', 'mayonnaise'],
  Other:     [],
}

// Strips leading quantity + unit or bare number, then lowercases.
// "500g beef mince" → "beef mince"
// "2 cloves garlic" → "garlic"
// "4 chicken thighs" → "chicken thighs"
// "olive oil" → "olive oil"
const UNIT_RE = /^\d+[\d./]*\s*(g|kg|ml|l|oz|lb|cups?|tbsps?|tsps?|teaspoons?|tablespoons?|bunches?|cloves?|heads?|cans?|tins?|packets?|large|small|medium|x)\s+/i
const BARE_NUMBER_RE = /^\d+\s+/

export function normalizeIngredient(text: string): string {
  const trimmed = text.trim()
  const afterUnit = trimmed.replace(UNIT_RE, '')
  const key = afterUnit === trimmed ? trimmed.replace(BARE_NUMBER_RE, '') : afterUnit
  return key.toLowerCase().trim()
}

export function autoGuessCategory(key: string): ShoppingCategory {
  const lower = key.toLowerCase()
  for (const cat of SHOPPING_CATEGORIES) {
    if (cat === 'Other') continue
    if (KEYWORD_MAP[cat].some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}
```

- [ ] **Step 4: Run the tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/ingredient-helpers.test.ts --reporter=verbose
```

Expected: all 17 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingredient-helpers.ts src/lib/__tests__/ingredient-helpers.test.ts
git commit -m "feat: add ingredient normalise and auto-guess helpers"
```

---

## Task 3: Export preview API

**Files:**
- Create: `src/app/api/meal-plan/export-preview/route.ts`
- Create: `src/app/api/meal-plan/export-preview/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/meal-plan/export-preview/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mealPlan: { findMany: vi.fn() },
    ingredientCategory: { findMany: vi.fn() },
    list: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'member',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

const mockMealPlan = {
  id: 'mp1',
  date: new Date('2026-04-14T00:00:00Z'),
  mealType: 'dinner',
  recipeId: 'r1',
  note: null,
  familyId: 'family-1',
  recipe: {
    id: 'r1',
    title: 'Spaghetti Bolognese',
    ingredients: JSON.stringify(['500g beef mince', '1 onion', 'parmesan to serve']),
  },
}

describe('GET /api/meal-plan/export-preview', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
  })

  it('returns 400 if from or to missing', async () => {
    const req = new Request('http://localhost/api/meal-plan/export-preview')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns empty recipes array when no meal plans in range', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([])
    vi.mocked(prisma.ingredientCategory.findMany).mockResolvedValue([])
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null)

    const req = new Request('http://localhost/api/meal-plan/export-preview?from=2026-04-14T00:00:00Z&to=2026-04-20T23:59:59Z')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recipes).toEqual([])
    expect(body.groceriesList).toBeNull()
  })

  it('marks ingredient as learned when found in IngredientCategory', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([mockMealPlan] as never)
    vi.mocked(prisma.ingredientCategory.findMany).mockResolvedValue([
      { id: 'ic1', familyId: 'family-1', key: 'beef mince', category: 'Meat', updatedAt: new Date() },
    ] as never)
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null)

    const req = new Request('http://localhost/api/meal-plan/export-preview?from=2026-04-14T00:00:00Z&to=2026-04-20T23:59:59Z')
    const res = await GET(req)
    const body = await res.json()

    const beefIng = body.recipes[0].ingredients.find((i: { key: string }) => i.key === 'beef mince')
    expect(beefIng.source).toBe('learned')
    expect(beefIng.category).toBe('Meat')
  })

  it('marks ingredient as guessed when not in IngredientCategory', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([mockMealPlan] as never)
    vi.mocked(prisma.ingredientCategory.findMany).mockResolvedValue([])
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null)

    const req = new Request('http://localhost/api/meal-plan/export-preview?from=2026-04-14T00:00:00Z&to=2026-04-20T23:59:59Z')
    const res = await GET(req)
    const body = await res.json()

    const onionIng = body.recipes[0].ingredients.find((i: { key: string }) => i.key === 'onion')
    expect(onionIng.source).toBe('guessed')
    expect(onionIng.category).toBe('Produce')
  })

  it('returns groceriesList with itemCount when list exists', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.mealPlan.findMany).mockResolvedValue([])
    vi.mocked(prisma.ingredientCategory.findMany).mockResolvedValue([])
    vi.mocked(prisma.list.findFirst).mockResolvedValue({
      id: 'list-1',
      _count: { items: 5 },
    } as never)

    const req = new Request('http://localhost/api/meal-plan/export-preview?from=2026-04-14T00:00:00Z&to=2026-04-20T23:59:59Z')
    const res = await GET(req)
    const body = await res.json()

    expect(body.groceriesList).toEqual({ id: 'list-1', itemCount: 5 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/meal-plan/export-preview/__tests__/route.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '../route'`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/meal-plan/export-preview/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { normalizeIngredient, autoGuessCategory } from '@/lib/ingredient-helpers'

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const entries = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: new Date(from), lte: new Date(to) },
      recipeId: { not: null },
    },
    include: { recipe: true },
    orderBy: { date: 'asc' },
  })

  const allKeys = entries.flatMap((e) =>
    safeParseArray(e.recipe!.ingredients).map((text) => normalizeIngredient(text))
  )
  const uniqueKeys = [...new Set(allKeys)]

  const learned = await prisma.ingredientCategory.findMany({
    where: { familyId: user.familyId, key: { in: uniqueKeys } },
  })
  const learnedMap = new Map(learned.map((l) => [l.key, l.category]))

  const recipes = entries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    title: e.recipe!.title,
    ingredients: safeParseArray(e.recipe!.ingredients).map((text) => {
      const key = normalizeIngredient(text)
      const learnedCat = learnedMap.get(key)
      return {
        text,
        key,
        category: learnedCat ?? autoGuessCategory(key),
        source: learnedCat ? 'learned' : 'guessed',
      }
    }),
  }))

  const groceriesList = await prisma.list.findFirst({
    where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
    include: { _count: { select: { items: { where: { isCompleted: false } } } } },
  })

  return NextResponse.json({
    recipes,
    groceriesList: groceriesList
      ? { id: groceriesList.id, itemCount: groceriesList._count.items }
      : null,
  })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/meal-plan/export-preview/__tests__/route.test.ts --reporter=verbose
```

Expected: all 5 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/meal-plan/export-preview/
git commit -m "feat: add export-preview API for groceries modal"
```

---

## Task 4: Export groceries API

**Files:**
- Create: `src/app/api/meal-plan/export-groceries/route.ts`
- Create: `src/app/api/meal-plan/export-groceries/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/meal-plan/export-groceries/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ingredientCategory: { upsert: vi.fn() },
    list: { findFirst: vi.fn(), create: vi.fn() },
    listItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'member',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

const mockList = { id: 'list-1', name: 'Groceries', type: 'SHOPPING', familyId: 'family-1', isActive: true, createdAt: new Date() }

const sampleItems = [
  { text: '500g beef mince', key: 'beef mince', category: 'Meat' },
  { text: '1 onion', key: 'onion', category: 'Produce' },
]

function makeRequest(body: object) {
  return new Request('http://localhost/api/meal-plan/export-groceries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/meal-plan/export-groceries', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.ingredientCategory.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.list.findFirst).mockResolvedValue(mockList as never)
    vi.mocked(prisma.listItem.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.listItem.createMany).mockResolvedValue({ count: 2 } as never)
  })

  it('returns 400 if items is empty', async () => {
    const res = await POST(makeRequest({ items: [], mode: 'replace' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if mode is invalid', async () => {
    const res = await POST(makeRequest({ items: sampleItems, mode: 'smash' }))
    expect(res.status).toBe(400)
  })

  it('upserts IngredientCategory for each item', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    expect(prisma.ingredientCategory.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.ingredientCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_key: { familyId: 'family-1', key: 'beef mince' } },
        update: { category: 'Meat' },
        create: { familyId: 'family-1', key: 'beef mince', category: 'Meat' },
      })
    )
  })

  it('replace mode clears existing items before creating', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'replace' }))
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { listId: 'list-1' } })
    expect(prisma.listItem.createMany).toHaveBeenCalled()
  })

  it('append mode does NOT clear existing items', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    expect(prisma.listItem.deleteMany).not.toHaveBeenCalled()
    expect(prisma.listItem.createMany).toHaveBeenCalled()
  })

  it('creates Groceries list when none exists', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.list.create).mockResolvedValue(mockList as never)

    await POST(makeRequest({ items: sampleItems, mode: 'replace' }))
    expect(prisma.list.create).toHaveBeenCalledWith({
      data: { name: 'Groceries', type: 'SHOPPING', familyId: 'family-1' },
    })
  })

  it('returns listId and itemCount on success', async () => {
    const res = await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.listId).toBe('list-1')
    expect(body.itemCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/meal-plan/export-groceries/__tests__/route.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '../route'`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/meal-plan/export-groceries/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

interface ExportItem {
  text: string
  key: string
  category: string
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { items, mode } = body as { items: ExportItem[]; mode: 'replace' | 'append' }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }
  if (mode !== 'replace' && mode !== 'append') {
    return NextResponse.json({ error: 'mode must be replace or append' }, { status: 400 })
  }

  await Promise.all(
    items.map((item) =>
      prisma.ingredientCategory.upsert({
        where: { familyId_key: { familyId: user.familyId, key: item.key } },
        update: { category: item.category },
        create: { familyId: user.familyId, key: item.key, category: item.category },
      })
    )
  )

  let list = await prisma.list.findFirst({
    where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
  })
  if (!list) {
    list = await prisma.list.create({
      data: { name: 'Groceries', type: 'SHOPPING', familyId: user.familyId },
    })
  }

  if (mode === 'replace') {
    await prisma.listItem.deleteMany({ where: { listId: list.id } })
  }

  await prisma.listItem.createMany({
    data: items.map((item, i) => ({
      content: item.text,
      category: item.category,
      sortOrder: i,
      createdBy: user.id,
      listId: list!.id,
    })),
  })

  return NextResponse.json({ listId: list.id, itemCount: items.length })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/meal-plan/export-groceries/__tests__/route.test.ts --reporter=verbose
```

Expected: all 6 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/meal-plan/export-groceries/
git commit -m "feat: add export-groceries API with learning upsert"
```

---

## Task 5: ExportGroceriesModal component

**Files:**
- Create: `src/components/meal-plan/ExportGroceriesModal.tsx`

No unit tests — this is a client UI component. Verify by hand in Task 6.

- [ ] **Step 1: Create the component**

Create `src/components/meal-plan/ExportGroceriesModal.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'
import { toast } from 'sonner'
import { ShoppingCartIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewIngredient {
  text: string
  key: string
  category: ShoppingCategory
  source: 'learned' | 'guessed'
}

interface PreviewRecipe {
  date: string
  title: string
  ingredients: PreviewIngredient[]
}

interface GroceriesList {
  id: string
  itemCount: number
}

export interface ExportGroceriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekFrom: string // YYYY-MM-DD
  weekTo: string   // YYYY-MM-DD
}

type Status = 'loading' | 'ready' | 'confirming' | 'saving'

export function ExportGroceriesModal({
  open,
  onOpenChange,
  weekFrom,
  weekTo,
}: ExportGroceriesModalProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [recipes, setRecipes] = useState<PreviewRecipe[]>([])
  const [groceriesList, setGroceriesList] = useState<GroceriesList | null>(null)
  const [overrides, setOverrides] = useState<Map<string, ShoppingCategory>>(new Map())

  useEffect(() => {
    if (!open) return
    setStatus('loading')
    setOverrides(new Map())

    fetch(
      `/api/meal-plan/export-preview?from=${weekFrom}T00:00:00Z&to=${weekTo}T23:59:59Z`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.recipes.length === 0) {
          onOpenChange(false)
          toast.info("No recipes on this week's meal plan.")
          return
        }
        setRecipes(data.recipes)
        setGroceriesList(data.groceriesList)
        setStatus('ready')
      })
      .catch(() => {
        onOpenChange(false)
        toast.error('Failed to load ingredients. Please try again.')
      })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function getCategory(ing: PreviewIngredient): ShoppingCategory {
    return (overrides.get(ing.key) ?? ing.category) as ShoppingCategory
  }

  function setCategory(key: string, cat: ShoppingCategory) {
    setOverrides((prev) => new Map(prev).set(key, cat))
  }

  function buildItems() {
    return recipes.flatMap((r) =>
      r.ingredients.map((ing) => ({
        text: ing.text,
        key: ing.key,
        category: getCategory(ing),
      }))
    )
  }

  async function save(mode: 'replace' | 'append') {
    setStatus('saving')
    try {
      const res = await fetch('/api/meal-plan/export-groceries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: buildItems(), mode }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onOpenChange(false)
      toast.success(`${data.itemCount} items added to Groceries`, {
        action: { label: 'View list', onClick: () => router.push('/lists') },
      })
    } catch {
      setStatus('ready')
      toast.error('Failed to save. Please try again.')
    }
  }

  function handleAddToGroceries() {
    if (groceriesList && groceriesList.itemCount > 0) {
      setStatus('confirming')
    } else {
      save('replace')
    }
  }

  const totalItems = recipes.reduce((sum, r) => sum + r.ingredients.length, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Add to Groceries</DialogTitle>
          {status !== 'loading' && (
            <p className="text-sm text-muted-foreground mt-1">
              {totalItems} ingredient{totalItems !== 1 ? 's' : ''} from{' '}
              {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}. Tap a
              category to change it.
            </p>
          )}
        </DialogHeader>

        {status === 'loading' && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading ingredients…
          </div>
        )}

        {status !== 'loading' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
              {recipes.map((recipe) => (
                <div key={recipe.title + recipe.date}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                    {recipe.title}
                  </p>
                  <div className="space-y-1">
                    {recipe.ingredients.map((ing) => {
                      const cat = getCategory(ing)
                      const isLearned =
                        !overrides.has(ing.key) && ing.source === 'learned'
                      return (
                        <div
                          key={ing.key + ing.text}
                          className="flex items-center gap-2 py-1"
                        >
                          <span className="flex-1 text-sm">{ing.text}</span>
                          <select
                            value={cat}
                            onChange={(e) =>
                              setCategory(ing.key, e.target.value as ShoppingCategory)
                            }
                            className={cn(
                              'h-6 rounded-full px-2 text-xs font-semibold border appearance-none cursor-pointer',
                              isLearned
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            )}
                          >
                            {SHOPPING_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {status === 'confirming' ? (
              <div className="px-6 py-4 border-t border-border space-y-3">
                <p className="text-sm text-muted-foreground">
                  Groceries already has {groceriesList!.itemCount} item
                  {groceriesList!.itemCount !== 1 ? 's' : ''}. What would you
                  like to do?
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus('ready')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => save('append')}
                  >
                    Add to existing
                  </Button>
                  <Button size="sm" onClick={() => save('replace')}>
                    Replace
                  </Button>
                </div>
              </div>
            ) : (
              <DialogFooter className="px-6 py-4 border-t border-border flex-row items-center">
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500/70" />
                    Remembered
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500/70" />
                    Auto-guessed
                  </span>
                </div>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddToGroceries}
                  disabled={status === 'saving'}
                >
                  <ShoppingCartIcon className="h-4 w-4 mr-1" />
                  {status === 'saving' ? 'Saving…' : 'Add to Groceries'}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/meal-plan/ExportGroceriesModal.tsx
git commit -m "feat: add ExportGroceriesModal component"
```

---

## Task 6: Wire Export button into MealPlanGrid

**Files:**
- Modify: `src/components/meal-plan/MealPlanGrid.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `src/components/meal-plan/MealPlanGrid.tsx`, add `ExportGroceriesModal` to imports and `ShoppingCartIcon` to the lucide import:

Replace:
```typescript
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
```
With:
```typescript
import { ChevronLeftIcon, ChevronRightIcon, ShoppingCartIcon } from 'lucide-react'
```

Add the new import after the existing imports:
```typescript
import { ExportGroceriesModal } from './ExportGroceriesModal'
```

- [ ] **Step 2: Add exportOpen state**

Inside the `MealPlanGrid` function, after the existing `useState` declarations, add:

```typescript
const [exportOpen, setExportOpen] = useState(false)
```

- [ ] **Step 3: Add the Export button and modal to the JSX**

Replace the existing header block:
```typescript
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meal Plan</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
```

With:
```typescript
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meal Plan</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
          >
            <ShoppingCartIcon className="h-4 w-4 mr-1" />
            Groceries
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
```

- [ ] **Step 4: Add the modal to the JSX**

Just before the closing `</div>` of the component return (after the `AssignMealModal`), add:

```typescript
      <ExportGroceriesModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        weekFrom={toYMD(weekStart)}
        weekTo={toYMD(days[days.length - 1])}
      />
```

- [ ] **Step 5: Run the full test suite**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run --reporter=verbose
```

Expected: all tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/components/meal-plan/MealPlanGrid.tsx
git commit -m "feat: wire Export to Groceries button into meal plan"
```

---

## Manual verification checklist

After Task 6, test in the browser at `http://localhost:3300`:

1. Navigate to Meal Plan — confirm "Groceries" button appears in the header
2. With no recipes assigned this week — click Groceries — expect toast "No recipes on this week's meal plan."
3. Assign at least one recipe to the meal plan, then click Groceries — modal opens showing ingredients
4. Amber pills = auto-guessed; change one category using the dropdown — pill stays the same colour until the next time you open the modal (after saving it'll be green)
5. Click "Add to Groceries" — if no Groceries list exists, items are saved immediately; toast appears with "View list" link
6. Navigate to Lists — Groceries list exists, items grouped by category, checkable
7. Return to Meal Plan, click Groceries again — the ingredient you re-categorised is now green (learned)
8. Click "Add to Groceries" again — prompted with Replace / Add to existing — test both
