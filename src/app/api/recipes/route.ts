import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const tags = searchParams.get('tags') ?? ''

  const recipes = await prisma.recipe.findMany({
    where: {
      familyId: user.familyId,
      ...(search && { title: { contains: search } }),
    },
    orderBy: { createdAt: 'desc' },
  })

  // Filter by tag client-side (SQLite LIKE on comma-sep is messy)
  const tagList = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : []
  const filtered = tagList.length
    ? recipes.filter((r) => {
        const recipeTags = (r.tags ?? '').split(',').map((t) => t.trim().toLowerCase())
        return tagList.some((t) => recipeTags.includes(t))
      })
    : recipes

  return NextResponse.json(
    filtered.map((r) => ({
      ...r,
      ingredients: JSON.parse(r.ingredients) as string[],
      instructions: JSON.parse(r.instructions) as string[],
      tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
      createdAt: r.createdAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl } = body

  if (!title || !Array.isArray(ingredients) || !Array.isArray(instructions)) {
    return NextResponse.json(
      { error: 'title, ingredients (array), and instructions (array) are required' },
      { status: 400 }
    )
  }

  const recipe = await prisma.recipe.create({
    data: {
      title,
      description: description ?? null,
      ingredients: JSON.stringify(ingredients),
      instructions: JSON.stringify(instructions),
      tags: Array.isArray(tags) ? tags.join(',') : (tags ?? null),
      prepTime: prepTime ?? null,
      cookTime: cookTime ?? null,
      servings: servings ?? null,
      sourceUrl: sourceUrl ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json(
    {
      ...recipe,
      ingredients: JSON.parse(recipe.ingredients) as string[],
      instructions: JSON.parse(recipe.instructions) as string[],
      tags: recipe.tags ? recipe.tags.split(',').map((t) => t.trim()) : [],
      createdAt: recipe.createdAt.toISOString(),
    },
    { status: 201 }
  )
}
