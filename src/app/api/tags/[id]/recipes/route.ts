import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  // Check if tag exists and belongs to user's family
  const tag = await (prisma as any).tag.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Get recipes with this tag
  const recipeTags = await (prisma as any).recipeTag.findMany({
    where: { tagId: id },
    include: {
      recipe: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const recipes = recipeTags.map((rt: any) => {
    const recipe = rt.recipe
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      image: recipe.image,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      ingredients: safeParseArray(recipe.ingredients),
      instructions: safeParseArray(recipe.instructions),
      tags: recipe.tags ? recipe.tags.split(',').map((t: string) => t.trim()) : [],
      createdAt: recipe.createdAt.toISOString(),
    }
  })

  return NextResponse.json(recipes)
}