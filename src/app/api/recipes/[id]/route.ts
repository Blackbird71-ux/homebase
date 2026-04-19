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

function serializeRecipe(r: {
  id: string; title: string; description: string | null
  ingredients: string; instructions: string; image: string | null
  sourceUrl: string | null; prepTime: number | null; cookTime: number | null
  servings: number | null; tags: string | null; createdBy: string
  familyId: string; createdAt: Date
}) {
  return {
    ...r,
    ingredients: safeParseArray(r.ingredients),
    instructions: safeParseArray(r.instructions),
    tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
    createdAt: r.createdAt.toISOString(),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const recipe = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(serializeRecipe(recipe))
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, image, bookId } = body

  const existing = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ingredients !== undefined && { ingredients: JSON.stringify(ingredients) }),
      ...(instructions !== undefined && { instructions: JSON.stringify(instructions) }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags.join(',') : tags }),
      ...(prepTime !== undefined && { prepTime }),
      ...(cookTime !== undefined && { cookTime }),
      ...(servings !== undefined && { servings }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...(image !== undefined && { image: image ?? null }),
      ...('bookId' in body && { bookId: bookId ?? null }),
    },
  })

  return NextResponse.json(serializeRecipe(updated))
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const existing = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.recipe.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
