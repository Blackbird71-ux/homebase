import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const tag = await (prisma as any).tag.findFirst({
    where: { id, familyId: user.familyId },
    include: { _count: { select: { recipes: true } } },
  })

  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    emoji: tag.emoji ?? null,
    sortOrder: tag.sortOrder ?? 0,
    scope: tag.scope ?? 'general',
    createdAt: tag.createdAt.toISOString(),
    recipeCount: tag._count.recipes,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { name, color, scope, emoji, sortOrder } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json(
      { error: 'Tag name is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const trimmedName = name.trim()
  const trimmedColor = color !== undefined ? (color && typeof color === 'string' ? color.trim() : null) : undefined
  const trimmedScope = scope && typeof scope === 'string' ? scope.trim() : undefined
  const trimmedEmoji = emoji !== undefined ? (emoji && typeof emoji === 'string' ? emoji.trim() : null) : undefined

  const existingTag = await (prisma as any).tag.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existingTag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  const duplicateTag = await (prisma as any).tag.findFirst({
    where: { familyId: user.familyId, name: trimmedName, NOT: { id } },
  })
  if (duplicateTag) {
    return NextResponse.json(
      { error: 'A tag with this name already exists for your family' },
      { status: 409 }
    )
  }

  const updateData: Record<string, unknown> = { name: trimmedName }
  if (trimmedColor !== undefined) updateData.color = trimmedColor
  if (trimmedScope !== undefined) updateData.scope = trimmedScope
  if (trimmedEmoji !== undefined) updateData.emoji = trimmedEmoji
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder

  const updatedTag = await (prisma as any).tag.update({
    where: { id },
    data: updateData,
  })

  void createAuditLog(
    user,
    'update',
    'tag',
    id,
    `Updated tag "${existingTag.name}"`,
    { before: { name: existingTag.name, color: existingTag.color }, after: { name: trimmedName, color: trimmedColor } }
  )

  return NextResponse.json({
    id: updatedTag.id,
    name: updatedTag.name,
    color: updatedTag.color,
    emoji: updatedTag.emoji ?? null,
    sortOrder: updatedTag.sortOrder ?? 0,
    scope: updatedTag.scope ?? 'general',
    createdAt: updatedTag.createdAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'detach'

  const tag = await (prisma as any).tag.findFirst({
    where: { id, familyId: user.familyId },
    include: { _count: { select: { recipes: true } } },
  })
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  if (action === 'delete') {
    await (prisma as any).tag.delete({ where: { id } })

    void createAuditLog(
      user,
      'delete',
      'tag',
      id,
      `Deleted tag "${tag.name}" (removed from ${tag._count.recipes} recipes)`,
      { tag: { name: tag.name, recipeCount: tag._count.recipes } }
    )

    return NextResponse.json({
      success: true,
      message: `Tag "${tag.name}" and its ${tag._count.recipes} recipe associations have been deleted`,
    })
  } else {
    await (prisma as any).recipeTag.deleteMany({ where: { tagId: id } })

    void createAuditLog(
      user,
      'update',
      'tag',
      id,
      `Detached tag "${tag.name}" from ${tag._count.recipes} recipes`,
      { tag: { name: tag.name, detachedFrom: tag._count.recipes } }
    )

    return NextResponse.json({
      success: true,
      message: `Tag "${tag.name}" has been removed from ${tag._count.recipes} recipes`,
    })
  }
}
