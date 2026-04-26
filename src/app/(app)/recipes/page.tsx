import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
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
        image: true,
        recipeTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.recipeBook.findMany({
      where: { familyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { recipes: true } } },
    }),
  ])

  return {
    recipes: recipeRows.map((r) => {
      // Get tags from relational tags first, fall back to comma-separated string
      let tags: string[] = []
      if (r.recipeTags && r.recipeTags.length > 0) {
        tags = r.recipeTags.map((rt) => rt.tag.name)
      } else if (r.tags && r.tags !== 'legacy-tags') {
        tags = r.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
      }
      
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        tags,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        servings: r.servings,
        bookId: r.bookId,
        createdAt: r.createdAt.toISOString(),
        image: getLocalImageUrl(r.image),
      }
    }),
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
