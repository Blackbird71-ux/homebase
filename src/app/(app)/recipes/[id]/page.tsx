import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { notFound } from 'next/navigation'
import { RecipeDetail } from './RecipeDetail'

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cooking?: string }>
}) {
  const user = await requireSession()
  const { id } = await params
  const { cooking } = await searchParams

  const [recipe, bookRows] = await Promise.all([
    prisma.recipe.findFirst({
      where: { id, familyId: user.familyId },
      include: {
        recipeTags: {
          include: {
            tag: true
          }
        }
      },
    }),
    prisma.recipeBook.findMany({
      where: { familyId: user.familyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { recipes: true } } },
    }),
  ])
  if (!recipe) notFound()

  // Get tags from relational tags first, fall back to comma-separated string
  let tags: string[] = []
  if (recipe.recipeTags && recipe.recipeTags.length > 0) {
    tags = recipe.recipeTags.map((rt: any) => rt.tag.name)
  } else if (recipe.tags && recipe.tags !== 'legacy-tags') {
    tags = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
  }

  const serialized = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    notes: recipe.notes,
    ingredients: JSON.parse(recipe.ingredients) as string[],
    instructions: JSON.parse(recipe.instructions) as string[],
    tags,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    image: getLocalImageUrl(recipe.image),
    sourceUrl: recipe.sourceUrl,
    createdBy: recipe.createdBy,
    createdAt: recipe.createdAt.toISOString(),
    bookId: recipe.bookId,
    calories: recipe.calories,
    fatContent: recipe.fatContent,
    proteinContent: recipe.proteinContent,
    carbContent: recipe.carbContent,
    sodiumContent: recipe.sodiumContent,
  }

  const books = bookRows.map((b) => ({
    id: b.id,
    name: b.name,
    recipeCount: b._count.recipes,
  }))

  return <RecipeDetail recipe={serialized} books={books} currentUserId={user.id} isAdmin={user.role === 'admin'} startCooking={cooking === 'true'} />
}
