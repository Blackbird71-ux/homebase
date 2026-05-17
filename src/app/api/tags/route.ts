 import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const includeCounts = searchParams.get('includeCounts') === 'true'
  const scopeFilter = searchParams.get('scope')

  const where: Record<string, unknown> = {
    familyId: user.familyId,
    name: {
      not: 'legacy-tags',
      ...(search && { contains: search, mode: 'insensitive' }),
    },
  }

  // When a scope is provided, return tags for that scope plus general-purpose tags
  if (scopeFilter) {
    where.scope = { in: ['general', scopeFilter] }
  }

  const tags = await (prisma as any).tag.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: includeCounts
      ? {
          _count: {
            select: { recipes: true, activityTags: true, dayTags: true },
          },
        }
      : undefined,
  })

  if (includeCounts) {
    // Get all recipes for this family to check tags string field (legacy)
    const recipes = await (prisma as any).recipe.findMany({
      where: { familyId: user.familyId },
      select: { id: true, tags: true },
    })

    const tagNameToCountFromString: Record<string, number> = {}
    for (const recipe of recipes) {
      if (!recipe.tags) continue
      const recipeTags = recipe.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
      for (const tagName of recipeTags) {
        if (tagName === 'legacy-tags') continue
        tagNameToCountFromString[tagName] = (tagNameToCountFromString[tagName] || 0) + 1
      }
    }

    const response = tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      emoji: tag.emoji ?? null,
      sortOrder: tag.sortOrder ?? 0,
      scope: tag.scope ?? 'general',
      createdAt: tag.createdAt.toISOString(),
      recipeCount: (tag._count?.recipes || 0) + (tag._count?.activityTags || 0) + (tag._count?.dayTags || 0) + (tagNameToCountFromString[tag.name] || 0),
    }))

    return NextResponse.json(response)
  }

  const response = tags.map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    emoji: tag.emoji ?? null,
    sortOrder: tag.sortOrder ?? 0,
    scope: tag.scope ?? 'general',
    createdAt: tag.createdAt.toISOString(),
  }))

  return NextResponse.json(response)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { name, color, scope, emoji, sortOrder } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json(
      { error: 'Tag name is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const trimmedName = name.trim()
  const trimmedColor = color && typeof color === 'string' ? color.trim() : null
  const trimmedScope = scope && typeof scope === 'string' ? scope.trim() : 'general'
  const trimmedEmoji = emoji && typeof emoji === 'string' ? emoji.trim() : null

  const existingTag = await (prisma as any).tag.findFirst({
    where: { familyId: user.familyId, name: trimmedName },
  })

  if (existingTag) {
    return NextResponse.json(
      { error: 'A tag with this name already exists for your family' },
      { status: 409 }
    )
  }

  // For trip-scoped tags, compute next sortOrder
  let nextSortOrder = 0
  if (trimmedScope === 'trip') {
    const maxOrder = await (prisma as any).tag.aggregate({
      where: { familyId: user.familyId, scope: 'trip' },
      _max: { sortOrder: true },
    })
    nextSortOrder = (maxOrder._max?.sortOrder ?? -1) + 1
  }
  if (sortOrder !== undefined) nextSortOrder = sortOrder

  const tag = await (prisma as any).tag.create({
    data: {
      name: trimmedName,
      color: trimmedColor,
      emoji: trimmedEmoji,
      scope: trimmedScope,
      sortOrder: nextSortOrder,
      familyId: user.familyId,
    },
  })

  void createAuditLog(
    user,
    'create',
    'tag',
    tag.id,
    `Created tag "${trimmedName}"`,
    { tag: { name: trimmedName, color: trimmedColor, scope: trimmedScope } }
  )

  return NextResponse.json(
    {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      emoji: tag.emoji ?? null,
      sortOrder: tag.sortOrder ?? 0,
      scope: tag.scope ?? 'general',
      createdAt: tag.createdAt.toISOString(),
    },
    { status: 201 }
  )
}
