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

  it('returns 400 for invalid date strings', async () => {
    const req = new Request('http://localhost/api/meal-plan/export-preview?from=not-a-date&to=also-bad')
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
