import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { RecipesClient } from './RecipesClient'

async function getRecipes(familyId: string) {
  const recipes = await prisma.recipe.findMany({
    where: { familyId },
    orderBy: { createdAt: 'desc' },
  })
  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    servings: r.servings,
    createdAt: r.createdAt.toISOString(),
  }))
}

export default async function RecipesPage() {
  const user = await requireSession()
  const recipes = await getRecipes(user.familyId)
  return <RecipesClient initialRecipes={recipes} />
}
