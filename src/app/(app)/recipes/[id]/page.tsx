import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { RecipeDetail } from './RecipeDetail'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireSession()
  const { id } = await params

  const recipe = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!recipe) notFound()

  const serialized = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    ingredients: JSON.parse(recipe.ingredients) as string[],
    instructions: JSON.parse(recipe.instructions) as string[],
    tags: recipe.tags ? recipe.tags.split(',').map((t) => t.trim()) : [],
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    sourceUrl: recipe.sourceUrl,
    createdBy: recipe.createdBy,
    createdAt: recipe.createdAt.toISOString(),
  }

  return <RecipeDetail recipe={serialized} currentUserId={user.id} isAdmin={user.role === 'admin'} />
}
