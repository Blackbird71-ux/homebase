import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getLocalImageUrl } from '@/lib/image-cache'

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

async function _GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      recipe: {
        include: {
          recipeTags: {
            include: {
              tag: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const recipes = recipeTags.map((rt: any) => {
    const recipe = rt.recipe
    // Get tags from relational tags first, fall back to comma-separated string
    let tags: string[] = []
    if (recipe.recipeTags && recipe.recipeTags.length > 0) {
      tags = recipe.recipeTags.map((rt: any) => rt.tag.name)
    } else if (recipe.tags && recipe.tags !== 'legacy-tags') {
      tags = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
    }
    
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      image: getLocalImageUrl(recipe.image),
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      ingredients: safeParseArray(recipe.ingredients),
      instructions: safeParseArray(recipe.instructions),
      tags,
      createdAt: recipe.createdAt.toISOString(),
    }
  })

  return NextResponse.json(recipes)
}

export const GET = withRouteErrors(_GET)
