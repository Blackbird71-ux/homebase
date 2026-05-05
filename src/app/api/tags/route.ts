 import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const includeCounts = searchParams.get('includeCounts') === 'true'

  const tags = await (prisma as any).tag.findMany({
    where: {
      familyId: user.familyId,
      name: {
        not: 'legacy-tags',
        ...(search && { contains: search, mode: 'insensitive' }),
      },
    },
    orderBy: { createdAt: 'desc' },
    include: includeCounts
      ? {
          _count: {
            select: { recipes: true },
          },
        }
      : undefined,
  })

  // If we need counts, we also need to count recipes that have the tag in their tags string field
  if (includeCounts) {
    // Get all recipes for this family to check tags string
    const recipes = await (prisma as any).recipe.findMany({
      where: {
        familyId: user.familyId,
      },
      select: {
        id: true,
        tags: true,
      },
    })

    // Create a map of tag name to count from tags string
    const tagNameToCountFromString: Record<string, number> = {}
    
    for (const recipe of recipes) {
      if (!recipe.tags) continue
      
      // Parse comma-separated tags
      const recipeTags = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
      
      for (const tagName of recipeTags) {
        if (tagName === 'legacy-tags') continue
        tagNameToCountFromString[tagName] = (tagNameToCountFromString[tagName] || 0) + 1
      }
    }

    // Combine counts
    const response = tags.map((tag: any) => {
      const countFromRelationship = tag._count?.recipes || 0
      const countFromString = tagNameToCountFromString[tag.name] || 0
      // Sum both counts (a recipe could be counted twice if it has both relationship and string tag,
      // but that's unlikely and acceptable for display purposes)
      const totalCount = countFromRelationship + countFromString
      
      return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt.toISOString(),
        recipeCount: totalCount,
      }
    })

    return NextResponse.json(response)
  }

  const response = tags.map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  }))

  return NextResponse.json(response)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { name, color } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json(
      { error: 'Tag name is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const trimmedName = name.trim()
  const trimmedColor = color && typeof color === 'string' ? color.trim() : null

  // Check if tag already exists for this family
  const existingTag = await (prisma as any).tag.findFirst({
    where: {
      familyId: user.familyId,
      name: trimmedName,
    },
  })

  if (existingTag) {
    return NextResponse.json(
      { error: 'A tag with this name already exists for your family' },
      { status: 409 }
    )
  }

  const tag = await (prisma as any).tag.create({
    data: {
      name: trimmedName,
      color: trimmedColor,
      familyId: user.familyId,
    },
  })

  void createAuditLog(
    user,
    'create',
    'tag',
    tag.id,
    `Created tag "${trimmedName}"`,
    { tag: { name: trimmedName, color: trimmedColor } }
  )

  return NextResponse.json(
    {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    },
    { status: 201 }
  )
}