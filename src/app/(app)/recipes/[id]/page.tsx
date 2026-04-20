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
    include: {
      recipeTags: {
        include: {
          tag: true
        }
      }
    },
  })
  if (!recipe) notFound()

  // Get tags from relational tags first, fall back to comma-separated string
  let tags: string[] = []
  if (recipe.recipeTags && recipe.recipeTags.length > 0) {
    tags = recipe.recipeTags.map((rt: any) => rt.tag.name)
  } else if (recipe.tags) {
    tags = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
  }

  const serialized = {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    ingredients: JSON.parse(recipe.ingredients) as string[],
    instructions: JSON.parse(recipe.instructions) as string[],
    tags,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    image: recipe.image,
    sourceUrl: recipe.sourceUrl,
    createdBy: recipe.createdBy,
    createdAt: recipe.createdAt.toISOString(),
  }

  return <RecipeDetail recipe={serialized} currentUserId={user.id} isAdmin={user.role === 'admin'} />
}
