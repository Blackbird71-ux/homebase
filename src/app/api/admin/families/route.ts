import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSystemAdmin } from '@/lib/auth-helpers'
import { generateCode } from '@/lib/invite'

export async function GET() {
  const check = await requireSystemAdmin()
  if (check instanceof NextResponse) return check

  const families = await prisma.family.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const counts = await prisma.user.groupBy({
    by: ['familyId'],
    _count: { id: true },
  })
  const countMap = Object.fromEntries(counts.map(c => [c.familyId, c._count.id]))

  return NextResponse.json(
    families.map(f => ({
      id: f.id,
      name: f.name,
      memberCount: countMap[f.id] ?? 0,
    }))
  )
}

export async function POST(req: Request) {
  const check = await requireSystemAdmin()
  if (check instanceof NextResponse) return check

  const { name, copyRecipesFromFamilyId } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Family name is required' }, { status: 400 })
  }

  const family = await prisma.family.create({ data: { name: name.trim() } })

  // Generate admin invite code (7-day expiry)
  const code = generateCode()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.inviteCode.create({
    data: { code, familyId: family.id, expiresAt, isAdminInvite: true },
  })

  // Optionally copy recipes and recipe books
  let recipesCopied = 0
  if (copyRecipesFromFamilyId) {
    const books = await prisma.recipeBook.findMany({
      where: { familyId: copyRecipesFromFamilyId },
    })
    const bookIdMap: Record<string, string> = {}
    for (const book of books) {
      const newBook = await prisma.recipeBook.create({
        data: { name: book.name, familyId: family.id },
      })
      bookIdMap[book.id] = newBook.id
    }

    const recipes = await prisma.recipe.findMany({
      where: { familyId: copyRecipesFromFamilyId },
    })
    for (const recipe of recipes) {
      await prisma.recipe.create({
        data: {
          title: recipe.title,
          description: recipe.description,
          notes: recipe.notes,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          image: recipe.image,
          sourceUrl: recipe.sourceUrl,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          servings: recipe.servings,
          tags: recipe.tags,
          calories: recipe.calories,
          fatContent: recipe.fatContent,
          proteinContent: recipe.proteinContent,
          carbContent: recipe.carbContent,
          sodiumContent: recipe.sodiumContent,
          bookId: recipe.bookId ? (bookIdMap[recipe.bookId] ?? null) : null,
          createdBy: 'system',
          familyId: family.id,
        },
      })
      recipesCopied++
    }
  }

  return NextResponse.json({ family, inviteCode: code, recipesCopied })
}
