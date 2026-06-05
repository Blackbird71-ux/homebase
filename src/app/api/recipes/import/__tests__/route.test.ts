import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

const mockEntries: Array<{ entryName: string; getData: () => Buffer }> = []

vi.mock('adm-zip', () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: () => mockEntries,
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: { findFirst: vi.fn(), create: vi.fn() },
    recipe: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/image-cache', () => ({
  cacheImage: vi.fn(),
  getLocalImageUrl: vi.fn(),
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

function makeRequest(files: File[]) {
  const fd = new FormData()
  files.forEach((f) => fd.append('files', f))
  return new Request('http://localhost/api/recipes/import', { method: 'POST', body: fd })
}

describe('POST /api/recipes/import', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockEntries.length = 0

    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipeBook.create).mockResolvedValue({ id: 'book-1', name: 'Soups', familyId: 'family-1', createdAt: new Date() } as never)
    vi.mocked(prisma.recipe.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipe.create).mockResolvedValue({ id: 'r-1' } as never)
    vi.mocked(prisma.recipe.update).mockResolvedValue({ id: 'r-1' } as never)

    const { cacheImage } = await import('@/lib/image-cache')
    vi.mocked(cacheImage).mockResolvedValue(null)

    mockEntries.push({
      entryName: 'Pumpkin Soup.json',
      getData: () => Buffer.from(JSON.stringify(sampleUmamiJson)),
    })
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

  it('merges into existing recipe instead of creating a duplicate title in same book', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipe.findFirst).mockResolvedValue({ id: 'existing-1', title: 'Pumpkin Soup' } as never)

    const req = makeRequest([new File([new Uint8Array(4)], 'Soups.zip')])
    const res = await POST(req)
    const body = await res.json()

    expect(prisma.recipe.create).not.toHaveBeenCalled()
    expect(prisma.recipe.update).toHaveBeenCalled()
    expect(body.books[0].updated).toBe(1)
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
