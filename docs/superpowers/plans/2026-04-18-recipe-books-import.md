# Recipe Books & Umami Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recipe book collections to HomeBase and bulk-import Michelle's 11 Umami zip files (181 recipes) via a multi-file upload UI on both the Recipes page and Settings.

**Architecture:** New `RecipeBook` Prisma model with a nullable `bookId` FK on `Recipe` (SetNull on delete). A sidebar on the Recipes page filters by book client-side. An import API accepts multiple zip files (using `adm-zip`), parses Umami's schema.org JSON format, and creates books + recipes in one pass. `ImportModal` is a shared component used on both the Recipes page and a new Settings → Import tab.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + better-sqlite3, NextAuth v5, Vitest, Tailwind v4, shadcn/ui, `adm-zip` (install before starting: `npm install adm-zip && npm install -D @types/adm-zip`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add RecipeBook model + bookId on Recipe |
| Create | `src/lib/umami-parser.ts` | Parse Umami JSON → HomeBase recipe fields |
| Create | `src/lib/__tests__/umami-parser.test.ts` | Unit tests for parser |
| Create | `src/app/api/recipe-books/route.ts` | GET list + POST create book |
| Create | `src/app/api/recipe-books/__tests__/route.test.ts` | Tests for above |
| Create | `src/app/api/recipe-books/[id]/route.ts` | DELETE book (nulls recipes) |
| Modify | `src/app/api/recipes/route.ts` | Add bookId to GET response + POST body |
| Modify | `src/app/api/recipes/[id]/route.ts` | Add bookId to PUT body |
| Create | `src/app/api/recipes/import/route.ts` | POST multi-zip import |
| Create | `src/app/api/recipes/import/__tests__/route.test.ts` | Tests for import route |
| Create | `src/components/recipes/RecipeBookSidebar.tsx` | Sidebar + mobile tabs |
| Create | `src/components/recipes/ImportModal.tsx` | Multi-zip upload modal |
| Modify | `src/components/recipes/RecipeForm.tsx` | Add Book dropdown |
| Modify | `src/app/(app)/recipes/RecipesClient.tsx` | Wire sidebar + import modal |
| Modify | `src/app/(app)/recipes/page.tsx` | Fetch books + pass to client |
| Create | `src/components/settings/ImportTab.tsx` | Settings import tab |
| Modify | `src/app/(app)/settings/page.tsx` | Add Import tab |

---

## Task 1: Prisma schema — RecipeBook model + bookId on Recipe

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Install adm-zip**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npm install adm-zip
npm install -D @types/adm-zip
```

Expected: packages added to node_modules, no errors.

- [ ] **Step 2: Edit prisma/schema.prisma**

Add `recipeBooks RecipeBook[]` to the `Family` model (alongside `recipes Recipe[]`):

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
  recipeBooks          RecipeBook[]
  mealPlans            MealPlan[]
  coziImports          CoziImport[]
  inviteCodes          InviteCode[]
  ingredientCategories IngredientCategory[]
}
```

Add `bookId` and `book` to the `Recipe` model (after `tags`):

```prisma
model Recipe {
  id           String      @id @default(cuid())
  title        String
  description  String?
  ingredients  String
  instructions String
  image        String?
  sourceUrl    String?
  prepTime     Int?
  cookTime     Int?
  servings     Int?
  tags         String?
  bookId       String?
  book         RecipeBook? @relation(fields: [bookId], references: [id], onDelete: SetNull)
  createdBy    String
  familyId     String
  family       Family      @relation(fields: [familyId], references: [id])
  mealPlans    MealPlan[]
  createdAt    DateTime    @default(now())
}
```

Append new model at the end of the file (before `GoogleCalendarSync`):

```prisma
model RecipeBook {
  id        String   @id @default(cuid())
  name      String
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  recipes   Recipe[]
  createdAt DateTime @default(now())

  @@unique([familyId, name])
}
```

- [ ] **Step 3: Run the migration**

```bash
DATABASE_URL=file:./homebase.db npx prisma migrate dev --name add_recipe_books
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify Prisma client generated**

```bash
DATABASE_URL=file:./homebase.db npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add RecipeBook schema with bookId on Recipe"
```

---

## Task 2: Umami parser helpers

**Files:**
- Create: `src/lib/umami-parser.ts`
- Create: `src/lib/__tests__/umami-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/umami-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  parseIso8601Duration,
  parseServings,
  parseUmamiTags,
  parseUmamiRecipe,
} from '@/lib/umami-parser'

describe('parseIso8601Duration', () => {
  it('returns null for zero duration', () => {
    expect(parseIso8601Duration('P0Y0M0DT0H0M0S')).toBeNull()
  })

  it('extracts minutes only', () => {
    expect(parseIso8601Duration('P0Y0M0DT0H10M0S')).toBe(10)
  })

  it('converts hours to minutes and adds', () => {
    expect(parseIso8601Duration('P0Y0M0DT1H30M0S')).toBe(90)
  })

  it('returns null for empty string', () => {
    expect(parseIso8601Duration('')).toBeNull()
  })
})

describe('parseServings', () => {
  it('parses integer string', () => {
    expect(parseServings('4')).toBe(4)
  })

  it('parses "N servings" format', () => {
    expect(parseServings('2 servings')).toBe(2)
  })

  it('returns null for empty string', () => {
    expect(parseServings('')).toBeNull()
  })

  it('returns null for non-numeric', () => {
    expect(parseServings('varies')).toBeNull()
  })
})

describe('parseUmamiTags', () => {
  it('removes recipe name (first keyword) and book name', () => {
    expect(parseUmamiTags('Mushroom Pasta, Vegetarian, RECIPES', 'Mushroom Pasta', 'RECIPES')).toEqual(['Vegetarian'])
  })

  it('returns empty array when only recipe name and book name', () => {
    expect(parseUmamiTags('Chicken Soup, Soups', 'Chicken Soup', 'Soups')).toEqual([])
  })

  it('returns empty array for empty keywords', () => {
    expect(parseUmamiTags('', 'anything', 'book')).toEqual([])
  })

  it('trims whitespace from tags', () => {
    expect(parseUmamiTags('My Recipe,  Italian , Pasta', 'My Recipe', 'Other')).toEqual(['Italian', 'Pasta'])
  })

  it('deduplicates tags', () => {
    expect(parseUmamiTags('Recipe, Keto, Keto', 'Recipe', 'Book')).toEqual(['Keto'])
  })
})

describe('parseUmamiRecipe', () => {
  const umamiJson = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Pumpkin Soup',
    url: 'https://www.umami.recipes/recipe/abc123',
    image: ['https://www.umami.recipes/api/image/abc123?w=2048'],
    description: 'A warming autumn soup',
    prepTime: 'P0Y0M0DT0H15M0S',
    cookTime: 'P0Y0M0DT0H30M0S',
    recipeYield: '4 servings',
    keywords: 'Pumpkin Soup, Soups',
    recipeIngredient: ['1kg pumpkin', '2 cups stock'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Chop pumpkin.' },
      { '@type': 'HowToStep', text: 'Simmer for 20 minutes.' },
    ],
  }

  it('maps title, sourceUrl, image, description', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.title).toBe('Pumpkin Soup')
    expect(result.sourceUrl).toBe('https://www.umami.recipes/recipe/abc123')
    expect(result.image).toBe('https://www.umami.recipes/api/image/abc123?w=2048')
    expect(result.description).toBe('A warming autumn soup')
  })

  it('maps prepTime and cookTime to minutes', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.prepTime).toBe(15)
    expect(result.cookTime).toBe(30)
  })

  it('maps servings', () => {
    expect(parseUmamiRecipe(umamiJson, 'Soups').servings).toBe(4)
  })

  it('maps ingredients as array', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.ingredients).toEqual(['1kg pumpkin', '2 cups stock'])
  })

  it('maps instructions as array of step texts', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.instructions).toEqual(['Chop pumpkin.', 'Simmer for 20 minutes.'])
  })

  it('strips recipe name and book name from tags', () => {
    const result = parseUmamiRecipe(umamiJson, 'Soups')
    expect(result.tags).toEqual([])
  })

  it('handles missing image', () => {
    const result = parseUmamiRecipe({ ...umamiJson, image: [] }, 'Soups')
    expect(result.image).toBeNull()
  })

  it('handles missing description', () => {
    const result = parseUmamiRecipe({ ...umamiJson, description: undefined }, 'Soups')
    expect(result.description).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/umami-parser.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '@/lib/umami-parser'`.

- [ ] **Step 3: Implement umami-parser.ts**

Create `src/lib/umami-parser.ts`:

```typescript
export interface UmamiJson {
  name: string
  url?: string
  image?: string[]
  description?: string
  prepTime?: string
  cookTime?: string
  recipeYield?: string
  keywords?: string
  recipeIngredient?: string[]
  recipeInstructions?: { '@type': string; text: string }[]
}

export interface ParsedRecipe {
  title: string
  sourceUrl: string | null
  image: string | null
  description: string | null
  ingredients: string[]
  instructions: string[]
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  tags: string[]
}

export function parseIso8601Duration(s: string): number | null {
  if (!s) return null
  const hours = s.match(/(\d+)H/)?.[1] ?? '0'
  const minutes = s.match(/(\d+)M/)?.[1] ?? '0'
  const total = parseInt(hours) * 60 + parseInt(minutes)
  return total > 0 ? total : null
}

export function parseServings(s: string): number | null {
  if (!s) return null
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

export function parseUmamiTags(keywords: string, recipeName: string, bookName: string): string[] {
  if (!keywords) return []
  const seen = new Set<string>()
  const result: string[] = []
  const lowerRecipe = recipeName.toLowerCase()
  const lowerBook = bookName.toLowerCase()
  for (const raw of keywords.split(',')) {
    const tag = raw.trim()
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (lower === lowerRecipe || lower === lowerBook) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(tag)
  }
  return result
}

export function parseUmamiRecipe(json: UmamiJson, bookName: string): ParsedRecipe {
  return {
    title: json.name,
    sourceUrl: json.url ?? null,
    image: json.image?.[0] ?? null,
    description: json.description ?? null,
    ingredients: json.recipeIngredient ?? [],
    instructions: (json.recipeInstructions ?? []).map((s) => s.text),
    prepTime: parseIso8601Duration(json.prepTime ?? ''),
    cookTime: parseIso8601Duration(json.cookTime ?? ''),
    servings: parseServings(json.recipeYield ?? ''),
    tags: parseUmamiTags(json.keywords ?? '', json.name, bookName),
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/umami-parser.test.ts --reporter=verbose
```

Expected: all 20 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/umami-parser.ts src/lib/__tests__/umami-parser.test.ts
git commit -m "feat: add Umami JSON parser helpers"
```

---

## Task 3: Recipe books API (GET, POST, DELETE)

**Files:**
- Create: `src/app/api/recipe-books/route.ts`
- Create: `src/app/api/recipe-books/__tests__/route.test.ts`
- Create: `src/app/api/recipe-books/[id]/route.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/recipe-books/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

describe('GET /api/recipe-books', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
  })

  it('returns books with recipeCount', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findMany).mockResolvedValue([
      { id: 'book-1', name: 'Soups', familyId: 'family-1', createdAt: new Date(), _count: { recipes: 11 } },
    ] as never)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([{ id: 'book-1', name: 'Soups', recipeCount: 11 }])
  })
})

describe('POST /api/recipe-books', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
  })

  it('returns 400 if name is missing', async () => {
    const req = new Request('http://localhost/api/recipe-books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates a book and returns it', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.create).mockResolvedValue({
      id: 'book-1',
      name: 'Soups',
      familyId: 'family-1',
      createdAt: new Date(),
    } as never)

    const req = new Request('http://localhost/api/recipe-books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Soups' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.name).toBe('Soups')
    expect(prisma.recipeBook.create).toHaveBeenCalledWith({
      data: { name: 'Soups', familyId: 'family-1' },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/recipe-books/__tests__/route.test.ts --reporter=verbose
```

Expected: fail with `Cannot find module '../route'`.

- [ ] **Step 3: Implement GET + POST route**

Create `src/app/api/recipe-books/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()
  const books = await prisma.recipeBook.findMany({
    where: { familyId: user.familyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { recipes: true } } },
  })
  return NextResponse.json(
    books.map((b) => ({ id: b.id, name: b.name, recipeCount: b._count.recipes }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const { name } = await req.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const book = await prisma.recipeBook.create({
    data: { name: name.trim(), familyId: user.familyId },
  })
  return NextResponse.json({ id: book.id, name: book.name }, { status: 201 })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/recipe-books/__tests__/route.test.ts --reporter=verbose
```

Expected: all 3 tests pass.

- [ ] **Step 5: Implement DELETE route**

Create `src/app/api/recipe-books/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const book = await prisma.recipeBook.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.recipeBook.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

Note: `onDelete: SetNull` on the Recipe schema means Prisma automatically nulls `bookId` on all recipes in this book when the book is deleted — no manual updateMany needed.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recipe-books/
git commit -m "feat: add recipe-books API (GET, POST, DELETE)"
```

---

## Task 4: Extend recipe routes to support bookId

**Files:**
- Modify: `src/app/api/recipes/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`

- [ ] **Step 1: Add bookId to GET list response and POST body in route.ts**

Open `src/app/api/recipes/route.ts`.

In the GET handler, add `bookId` to the `findMany` select and to the map output. Replace the return statement in GET:

```typescript
export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const tags = searchParams.get('tags') ?? ''
  const bookId = searchParams.get('bookId')

  const recipes = await prisma.recipe.findMany({
    where: {
      familyId: user.familyId,
      ...(search && { title: { contains: search } }),
      ...(bookId !== null && { bookId: bookId === 'null' ? null : bookId }),
    },
    orderBy: { createdAt: 'desc' },
  })

  const tagList = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : []
  const filtered = tagList.length
    ? recipes.filter((r) => {
        const recipeTags = (r.tags ?? '').split(',').map((t) => t.trim().toLowerCase())
        return tagList.some((t) => recipeTags.includes(t))
      })
    : recipes

  return NextResponse.json(
    filtered.map((r) => ({
      ...r,
      ingredients: safeParseArray(r.ingredients),
      instructions: safeParseArray(r.instructions),
      tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
      createdAt: r.createdAt.toISOString(),
    }))
  )
}
```

In the POST handler, extract `bookId` and include it in the create call. Replace the POST function:

```typescript
export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, bookId } = body

  if (!title || !Array.isArray(ingredients) || !Array.isArray(instructions)) {
    return NextResponse.json(
      { error: 'title, ingredients (array), and instructions (array) are required' },
      { status: 400 }
    )
  }

  const recipe = await prisma.recipe.create({
    data: {
      title,
      description: description ?? null,
      ingredients: JSON.stringify(ingredients),
      instructions: JSON.stringify(instructions),
      tags: Array.isArray(tags) ? tags.join(',') : (tags ?? null),
      prepTime: prepTime ?? null,
      cookTime: cookTime ?? null,
      servings: servings ?? null,
      sourceUrl: sourceUrl ?? null,
      bookId: bookId ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json(
    {
      ...recipe,
      ingredients: JSON.parse(recipe.ingredients) as string[],
      instructions: JSON.parse(recipe.instructions) as string[],
      tags: recipe.tags ? recipe.tags.split(',').map((t) => t.trim()) : [],
      createdAt: recipe.createdAt.toISOString(),
    },
    { status: 201 }
  )
}
```

- [ ] **Step 2: Add bookId to PUT handler in [id]/route.ts**

Open `src/app/api/recipes/[id]/route.ts`.

In the PUT handler, extract `bookId` from body and add it to the update data. Replace the PUT function:

```typescript
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, bookId } = body

  const existing = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ingredients !== undefined && { ingredients: JSON.stringify(ingredients) }),
      ...(instructions !== undefined && { instructions: JSON.stringify(instructions) }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags.join(',') : tags }),
      ...(prepTime !== undefined && { prepTime }),
      ...(cookTime !== undefined && { cookTime }),
      ...(servings !== undefined && { servings }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...('bookId' in body && { bookId: bookId ?? null }),
    },
  })

  return NextResponse.json(serializeRecipe(updated))
}
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass (the existing recipe tests don't use bookId so they still pass).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recipes/route.ts src/app/api/recipes/[id]/route.ts
git commit -m "feat: add bookId support to recipe GET/POST/PUT routes"
```

---

## Task 5: Import API route

**Files:**
- Create: `src/app/api/recipes/import/route.ts`
- Create: `src/app/api/recipes/import/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/recipes/import/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('adm-zip', () => {
  const mockEntries: Array<{ entryName: string; getData: () => Buffer }> = []
  return {
    default: vi.fn().mockImplementation(() => ({
      getEntries: () => mockEntries,
    })),
    __setEntries: (entries: typeof mockEntries) => {
      mockEntries.length = 0
      mockEntries.push(...entries)
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: { findFirst: vi.fn(), create: vi.fn() },
    recipe: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

const sampleUmamiJson = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Pumpkin Soup',
  url: 'https://www.umami.recipes/recipe/abc',
  image: ['https://img.example.com/abc.jpg'],
  prepTime: 'P0Y0M0DT0H10M0S',
  cookTime: 'P0Y0M0DT0H20M0S',
  recipeYield: '4 servings',
  keywords: 'Pumpkin Soup, Soups',
  recipeIngredient: ['1kg pumpkin', '2 cups stock'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Simmer pumpkin.' }],
}

function makeZipFile(name: string, entries: Array<{ name: string; json: object }>): File {
  const { __setEntries } = vi.mocked(await import('adm-zip')) as unknown as { __setEntries: (e: unknown[]) => void }
  void __setEntries // used via the mock
  return new File([new Uint8Array(4)], name, { type: 'application/zip' })
}

function makeRequest(files: File[]) {
  const fd = new FormData()
  files.forEach((f) => fd.append('files', f))
  return new Request('http://localhost/api/recipes/import', { method: 'POST', body: fd })
}

describe('POST /api/recipes/import', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipeBook.create).mockResolvedValue({ id: 'book-1', name: 'Soups', familyId: 'family-1', createdAt: new Date() } as never)
    vi.mocked(prisma.recipe.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipe.create).mockResolvedValue({ id: 'r-1' } as never)

    const admZip = await import('adm-zip')
    ;(admZip as unknown as { __setEntries: (e: unknown[]) => void }).__setEntries([
      {
        entryName: 'Pumpkin Soup.json',
        getData: () => Buffer.from(JSON.stringify(sampleUmamiJson)),
      },
    ])
  })

  it('returns 400 if no files provided', async () => {
    const req = makeRequest([])
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates book when it does not exist', async () => {
    const { prisma } = await import('@/lib/prisma')
    const req = makeRequest([new File([new Uint8Array(4)], 'Soups.zip')])
    await POST(req)
    expect(prisma.recipeBook.create).toHaveBeenCalledWith({
      data: { name: 'Soups', familyId: 'family-1' },
    })
  })

  it('uses existing book when found', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue({ id: 'book-existing', name: 'Soups', familyId: 'family-1', createdAt: new Date() } as never)

    const req = makeRequest([new File([new Uint8Array(4)], 'Soups.zip')])
    await POST(req)
    expect(prisma.recipeBook.create).not.toHaveBeenCalled()
  })

  it('skips duplicate recipe title in same book', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipe.findFirst).mockResolvedValue({ id: 'r-existing' } as never)

    const req = makeRequest([new File([new Uint8Array(4)], 'Soups.zip')])
    const res = await POST(req)
    const body = await res.json()

    expect(prisma.recipe.create).not.toHaveBeenCalled()
    expect(body.books[0].skipped).toBe(1)
    expect(body.books[0].imported).toBe(0)
  })

  it('returns summary with imported and skipped counts', async () => {
    const req = makeRequest([new File([new Uint8Array(4)], 'Soups.zip')])
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.books).toHaveLength(1)
    expect(body.books[0].name).toBe('Soups')
    expect(body.books[0].imported).toBe(1)
    expect(body.books[0].skipped).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/recipes/import/__tests__/route.test.ts --reporter=verbose
```

Expected: fail with `Cannot find module '../route'`.

- [ ] **Step 3: Implement the import route**

Create `src/app/api/recipes/import/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { parseUmamiRecipe, type UmamiJson } from '@/lib/umami-parser'

export async function POST(req: Request) {
  const user = await requireSession()

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: Array<{ name: string; imported: number; skipped: number; error?: string }> = []

  for (const file of files) {
    const bookName = file.name.replace(/\.zip$/i, '')
    let imported = 0
    let skipped = 0

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries().filter((e) => e.entryName.endsWith('.json'))

      let book = await prisma.recipeBook.findFirst({
        where: { familyId: user.familyId, name: bookName },
      })
      if (!book) {
        book = await prisma.recipeBook.create({
          data: { name: bookName, familyId: user.familyId },
        })
      }

      for (const entry of entries) {
        try {
          const json = JSON.parse(entry.getData().toString('utf8')) as UmamiJson
          const parsed = parseUmamiRecipe(json, bookName)

          const duplicate = await prisma.recipe.findFirst({
            where: {
              familyId: user.familyId,
              bookId: book.id,
              title: { equals: parsed.title, mode: 'insensitive' },
            },
          })

          if (duplicate) {
            skipped++
            continue
          }

          await prisma.recipe.create({
            data: {
              title: parsed.title,
              description: parsed.description,
              ingredients: JSON.stringify(parsed.ingredients),
              instructions: JSON.stringify(parsed.instructions),
              image: parsed.image,
              sourceUrl: parsed.sourceUrl,
              prepTime: parsed.prepTime,
              cookTime: parsed.cookTime,
              servings: parsed.servings,
              tags: parsed.tags.join(',') || null,
              bookId: book.id,
              familyId: user.familyId,
              createdBy: user.id,
            },
          })
          imported++
        } catch {
          skipped++
        }
      }

      results.push({ name: bookName, imported, skipped })
    } catch (err) {
      results.push({ name: bookName, imported: 0, skipped: 0, error: String(err) })
    }
  }

  return NextResponse.json({ books: results })
}
```

Note: SQLite doesn't support `mode: 'insensitive'` — replace the duplicate check with a case-insensitive manual approach:

```typescript
// Replace the duplicate check with:
const existing = await prisma.recipe.findMany({
  where: { familyId: user.familyId, bookId: book.id },
  select: { title: true },
})
const existingTitles = new Set(existing.map((r) => r.title.toLowerCase()))

// Then inside the entry loop, replace the findFirst with:
if (existingTitles.has(parsed.title.toLowerCase())) {
  skipped++
  continue
}
existingTitles.add(parsed.title.toLowerCase())
```

The full corrected import route with the pre-loaded title set:

```typescript
import { NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { parseUmamiRecipe, type UmamiJson } from '@/lib/umami-parser'

export async function POST(req: Request) {
  const user = await requireSession()

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: Array<{ name: string; imported: number; skipped: number; error?: string }> = []

  for (const file of files) {
    const bookName = file.name.replace(/\.zip$/i, '')
    let imported = 0
    let skipped = 0

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries().filter((e) => e.entryName.endsWith('.json'))

      let book = await prisma.recipeBook.findFirst({
        where: { familyId: user.familyId, name: bookName },
      })
      if (!book) {
        book = await prisma.recipeBook.create({
          data: { name: bookName, familyId: user.familyId },
        })
      }

      const existingRows = await prisma.recipe.findMany({
        where: { familyId: user.familyId, bookId: book.id },
        select: { title: true },
      })
      const existingTitles = new Set(existingRows.map((r) => r.title.toLowerCase()))

      for (const entry of entries) {
        try {
          const json = JSON.parse(entry.getData().toString('utf8')) as UmamiJson
          const parsed = parseUmamiRecipe(json, bookName)

          if (existingTitles.has(parsed.title.toLowerCase())) {
            skipped++
            continue
          }
          existingTitles.add(parsed.title.toLowerCase())

          await prisma.recipe.create({
            data: {
              title: parsed.title,
              description: parsed.description,
              ingredients: JSON.stringify(parsed.ingredients),
              instructions: JSON.stringify(parsed.instructions),
              image: parsed.image,
              sourceUrl: parsed.sourceUrl,
              prepTime: parsed.prepTime,
              cookTime: parsed.cookTime,
              servings: parsed.servings,
              tags: parsed.tags.join(',') || null,
              bookId: book.id,
              familyId: user.familyId,
              createdBy: user.id,
            },
          })
          imported++
        } catch {
          skipped++
        }
      }

      results.push({ name: bookName, imported, skipped })
    } catch (err) {
      results.push({ name: bookName, imported: 0, skipped: 0, error: String(err) })
    }
  }

  return NextResponse.json({ books: results })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/recipes/import/__tests__/route.test.ts --reporter=verbose
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recipes/import/
git commit -m "feat: add multi-zip Umami import API route"
```

---

## Task 6: RecipeBookSidebar component

**Files:**
- Create: `src/components/recipes/RecipeBookSidebar.tsx`

No unit tests — pure UI component. Verified in Task 9 browser testing.

- [ ] **Step 1: Create the component**

Create `src/components/recipes/RecipeBookSidebar.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RecipeBook {
  id: string
  name: string
  recipeCount: number
}

interface RecipeBookSidebarProps {
  books: RecipeBook[]
  activeBookId: string | null
  onSelect: (bookId: string | null) => void
  onBookCreated: (book: RecipeBook) => void
  onBookDeleted: (bookId: string) => void
  mobile?: boolean
}

export function RecipeBookSidebar({
  books,
  activeBookId,
  onSelect,
  onBookCreated,
  onBookDeleted,
  mobile = false,
}: RecipeBookSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/recipe-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (res.ok) {
        const book = await res.json() as { id: string; name: string }
        onBookCreated({ ...book, recipeCount: 0 })
        setNewName('')
        setCreating(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(book: RecipeBook) {
    if (!confirm(`Delete book "${book.name}"? Recipes will not be deleted.`)) return
    const res = await fetch(`/api/recipe-books/${book.id}`, { method: 'DELETE' })
    if (res.ok) onBookDeleted(book.id)
  }

  if (mobile) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        <Button
          variant={activeBookId === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelect(null)}
          className="shrink-0"
        >
          All
        </Button>
        {books.map((book) => (
          <Button
            key={book.id}
            variant={activeBookId === book.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(book.id)}
            className="shrink-0"
          >
            {book.name}
            <span className="ml-1 text-xs opacity-60">{book.recipeCount}</span>
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 h-full">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1">Books</p>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'flex items-center justify-between w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors',
          activeBookId === null
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-foreground'
        )}
      >
        All Recipes
      </button>
      {books.map((book) => (
        <div key={book.id} className="group flex items-center gap-1">
          <button
            onClick={() => onSelect(book.id)}
            className={cn(
              'flex items-center justify-between flex-1 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
              activeBookId === book.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-foreground'
            )}
          >
            <span className="truncate">{book.name}</span>
            <span className={cn(
              'text-xs ml-1 shrink-0',
              activeBookId === book.id ? 'opacity-75' : 'text-muted-foreground'
            )}>
              {book.recipeCount}
            </span>
          </button>
          <button
            onClick={() => handleDelete(book)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
            title="Delete book"
          >
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      ))}

      <div className="mt-auto pt-2 border-t border-border">
        {creating ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-1.5 px-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Book name"
              className="h-7 text-sm"
              autoFocus
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" className="flex-1 h-6 text-xs" disabled={saving || !newName.trim()}>
                {saving ? '...' : 'Add'}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <PlusIcon className="h-3 w-3" />
            New Book
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/recipes/RecipeBookSidebar.tsx
git commit -m "feat: add RecipeBookSidebar component"
```

---

## Task 7: ImportModal component

**Files:**
- Create: `src/components/recipes/ImportModal.tsx`

No unit tests — UI component. Verified by manual import in Task 9/10.

- [ ] **Step 1: Create the component**

Create `src/components/recipes/ImportModal.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UploadIcon, FileArchiveIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react'

interface BookResult {
  name: string
  imported: number
  skipped: number
  error?: string
}

interface ImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

type Status = 'idle' | 'importing' | 'done'

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<BookResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    setFiles(Array.from(selected).filter((f) => f.name.endsWith('.zip')))
    setResults([])
    setError(null)
    setStatus('idle')
  }

  async function handleImport() {
    if (!files.length) return
    setStatus('importing')
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await fetch('/api/recipes/import', { method: 'POST', body: fd })
      const data = await res.json() as { books?: BookResult[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
        setStatus('idle')
        return
      }
      setResults(data.books ?? [])
      setStatus('done')
      onImported?.()
    } catch {
      setError('Network error — please try again')
      setStatus('idle')
    }
  }

  function handleClose() {
    if (status === 'importing') return
    setFiles([])
    setResults([])
    setError(null)
    setStatus('idle')
    onOpenChange(false)
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Umami</DialogTitle>
        </DialogHeader>

        {status !== 'done' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Drop Umami zip files here, or click to select
              </p>
              <p className="text-xs text-muted-foreground">Multiple files supported</p>
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileArchiveIcon className="h-3.5 w-3.5 shrink-0" />
                    {f.name}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
              <CheckCircleIcon className="h-4 w-4" />
              {totalImported} recipe{totalImported !== 1 ? 's' : ''} imported
              {totalSkipped > 0 && `, ${totalSkipped} skipped`}
            </div>
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden text-sm">
              {results.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">{r.name}</span>
                  {r.error ? (
                    <span className="text-destructive text-xs">{r.error}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {r.imported} in · {r.skipped} skipped
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {status === 'done' ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={status === 'importing'}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!files.length || status === 'importing'}>
                {status === 'importing' ? 'Importing...' : `Import ${files.length > 0 ? files.length + ' file' + (files.length > 1 ? 's' : '') : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/recipes/ImportModal.tsx
git commit -m "feat: add ImportModal component for Umami zip import"
```

---

## Task 8: RecipeForm — add Book dropdown

**Files:**
- Modify: `src/components/recipes/RecipeForm.tsx`

- [ ] **Step 1: Add books prop and Book select to RecipeForm**

Open `src/components/recipes/RecipeForm.tsx`. Make these changes:

**Add to the `RecipeFormProps` interface** (after `initialData`):

```typescript
  books?: { id: string; name: string }[]
  initialBookId?: string | null
```

**Add `bookId` state** inside the component (after `const [sourceUrl, ...]`):

```typescript
  const [bookId, setBookId] = useState<string>(initialBookId ?? '')
```

**Add `bookId` to the POST body** inside `handleSubmit` (add to the JSON body object):

```typescript
          bookId: bookId || null,
```

**Add the Book select field** to the manual entry form, after the Tags field (before Source URL):

```typescript
              {books && books.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-book">Book</Label>
                  <select
                    id="recipe-book"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">No book</option>
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/recipes/RecipeForm.tsx
git commit -m "feat: add Book dropdown to RecipeForm"
```

---

## Task 9: Wire RecipesClient and page.tsx

**Files:**
- Modify: `src/app/(app)/recipes/page.tsx`
- Modify: `src/app/(app)/recipes/RecipesClient.tsx`

- [ ] **Step 1: Update page.tsx to fetch books**

Replace the full content of `src/app/(app)/recipes/page.tsx`:

```typescript
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { RecipesClient } from './RecipesClient'

async function getData(familyId: string) {
  const [recipeRows, bookRows] = await Promise.all([
    prisma.recipe.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        prepTime: true,
        cookTime: true,
        servings: true,
        bookId: true,
        createdAt: true,
      },
    }),
    prisma.recipeBook.findMany({
      where: { familyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { recipes: true } } },
    }),
  ])

  return {
    recipes: recipeRows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      servings: r.servings,
      bookId: r.bookId,
      createdAt: r.createdAt.toISOString(),
    })),
    books: bookRows.map((b) => ({
      id: b.id,
      name: b.name,
      recipeCount: b._count.recipes,
    })),
  }
}

export default async function RecipesPage() {
  const user = await requireSession()
  const { recipes, books } = await getData(user.familyId)
  return <RecipesClient initialRecipes={recipes} initialBooks={books} />
}
```

- [ ] **Step 2: Replace RecipesClient.tsx**

Replace the full content of `src/app/(app)/recipes/RecipesClient.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { RecipeBookSidebar } from '@/components/recipes/RecipeBookSidebar'
import { ImportModal } from '@/components/recipes/ImportModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon, SearchIcon, UploadIcon } from 'lucide-react'
import type { RecipeBook } from '@/components/recipes/RecipeBookSidebar'

interface RecipeSummary {
  id: string
  title: string
  description: string | null
  tags: string[]
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  bookId: string | null
  createdAt: string
}

interface RecipesClientProps {
  initialRecipes: RecipeSummary[]
  initialBooks: RecipeBook[]
}

export function RecipesClient({ initialRecipes, initialBooks }: RecipesClientProps) {
  const [recipes, setRecipes] = useState(initialRecipes)
  const [books, setBooks] = useState(initialBooks)
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const visibleRecipes = useMemo(() => {
    let result = activeBookId
      ? recipes.filter((r) => r.bookId === activeBookId)
      : recipes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r) => r.title.toLowerCase().includes(q))
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag))
    }
    return result
  }, [recipes, activeBookId, search, activeTag])

  const allTags = useMemo(() => {
    const base = activeBookId ? recipes.filter((r) => r.bookId === activeBookId) : recipes
    const tagSet = new Set<string>()
    for (const r of base) r.tags.forEach((t) => tagSet.add(t))
    return Array.from(tagSet).sort()
  }, [recipes, activeBookId])

  function handleCreated(newRecipe: RecipeSummary) {
    setRecipes((prev) => [newRecipe, ...prev])
    if (newRecipe.bookId) {
      setBooks((prev) =>
        prev.map((b) => b.id === newRecipe.bookId ? { ...b, recipeCount: b.recipeCount + 1 } : b)
      )
    }
    setFormOpen(false)
  }

  function handleBookCreated(book: RecipeBook) {
    setBooks((prev) => [...prev, book].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function handleBookDeleted(bookId: string) {
    setBooks((prev) => prev.filter((b) => b.id !== bookId))
    setRecipes((prev) => prev.map((r) => r.bookId === bookId ? { ...r, bookId: null } : r))
    if (activeBookId === bookId) setActiveBookId(null)
  }

  async function handleImported() {
    // Reload page data after import to reflect new recipes and updated counts
    window.location.reload()
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-48 border-r border-border p-3 shrink-0 overflow-y-auto">
        <RecipeBookSidebar
          books={books}
          activeBookId={activeBookId}
          onSelect={(id) => { setActiveBookId(id); setActiveTag(null) }}
          onBookCreated={handleBookCreated}
          onBookDeleted={handleBookDeleted}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 overflow-auto min-w-0">
        {/* Mobile book tabs */}
        <div className="md:hidden">
          <RecipeBookSidebar
            books={books}
            activeBookId={activeBookId}
            onSelect={(id) => { setActiveBookId(id); setActiveTag(null) }}
            onBookCreated={handleBookCreated}
            onBookDeleted={handleBookDeleted}
            mobile
          />
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {activeBookId ? books.find((b) => b.id === activeBookId)?.name ?? 'Recipes' : 'Recipes'}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <UploadIcon className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-1" />
              Add recipe
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="pl-8"
            />
          </div>
          {allTags.map((tag) => (
            <Button
              key={tag}
              variant={activeTag === tag ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </Button>
          ))}
        </div>

        {visibleRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <p className="text-sm">No recipes found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleRecipes.map((r) => (
              <RecipeCard key={r.id} {...r} />
            ))}
          </div>
        )}
      </div>

      <RecipeForm
        key={formOpen ? 'open' : 'closed'}
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={handleCreated}
        books={books}
        initialBookId={activeBookId}
      />

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 4: Start dev server and verify in browser**

```bash
npm run dev
```

Open http://localhost:3300/recipes. Verify:
1. Sidebar shows "All Recipes" + "New Book" button on desktop
2. Mobile view shows horizontal book tabs
3. "Import" button opens ImportModal
4. "Add Recipe" shows Book dropdown (empty if no books yet)
5. "New Book" creates a book and it appears in the sidebar

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/recipes/
git commit -m "feat: wire RecipeBookSidebar and ImportModal into Recipes page"
```

---

## Task 10: Settings Import tab

**Files:**
- Create: `src/components/settings/ImportTab.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create ImportTab component**

Create `src/components/settings/ImportTab.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ImportModal } from '@/components/recipes/ImportModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UploadIcon } from 'lucide-react'

export function ImportTab() {
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Recipes</CardTitle>
          <CardDescription>
            Import recipe books from Umami. Export each book as a zip from Umami, then upload all zip files here. The zip filename becomes the book name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setImportOpen(true)}>
            <UploadIcon className="h-4 w-4 mr-2" />
            Import from Umami
          </Button>
        </CardContent>
      </Card>

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setImportOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add Import tab to settings page**

Open `src/app/(app)/settings/page.tsx`. Add the import at the top:

```typescript
import { ImportTab } from '@/components/settings/ImportTab'
```

Add `import` to `TabsList` (after Data trigger):

```typescript
            <TabsTrigger value="import">Import</TabsTrigger>
```

Add the `TabsContent` (after the data TabsContent):

```typescript
          <TabsContent value="import">
            <ImportTab />
          </TabsContent>
```

- [ ] **Step 3: Test in browser**

Navigate to http://localhost:3300/settings → Import tab. Verify the "Import from Umami" button opens the modal. Try importing `umami/Soups.zip` from the project root — should import 11 recipes into a "Soups" book. Navigate to /recipes and confirm the Soups book appears in the sidebar with 11 recipes.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ImportTab.tsx src/app/(app)/settings/page.tsx
git commit -m "feat: add Import tab to Settings for bulk Umami zip import"
```

---

## Manual Verification Checklist

After all tasks, test at http://localhost:3300:

1. **Settings → Import**: upload all 11 Umami zips at once → summary shows 181 recipes across 11 books
2. **Recipes page**: sidebar shows all 11 books with correct recipe counts
3. **Click "Soups"**: grid shows only soup recipes, search and tag filters work within the book
4. **Click "All Recipes"**: shows all 181 recipes
5. **Add Recipe**: Book dropdown pre-selects active book; saving creates recipe in that book, count increments
6. **Import again** (same files): all 181 skipped, 0 imported — duplicate detection working
7. **Delete a book**: recipes move to "All Recipes" (not deleted), sidebar updates
8. **Mobile** (resize browser): horizontal book tabs appear, sidebar hidden
