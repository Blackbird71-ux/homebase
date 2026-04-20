import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const tag = await (prisma as any).tag.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
    include: {
      _count: {
        select: { recipes: true },
      },
    },
  })

  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: tag.id,
    name: tag.name,
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
  const { name } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json(
      { error: 'Tag name is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const trimmedName = name.trim()

  // Check if tag exists and belongs to user's family
  const existingTag = await (prisma as any).tag.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!existingTag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Check if new name already exists for this family
  const duplicateTag = await (prisma as any).tag.findFirst({
    where: {
      familyId: user.familyId,
      name: trimmedName,
      NOT: { id },
    },
  })

  if (duplicateTag) {
    return NextResponse.json(
      { error: 'A tag with this name already exists for your family' },
      { status: 409 }
    )
  }

  const updatedTag = await (prisma as any).tag.update({
    where: { id },
    data: { name: trimmedName },
  })

  return NextResponse.json({
    id: updatedTag.id,
    name: updatedTag.name,
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

  // Check if tag exists and belongs to user's family
  const tag = await (prisma as any).tag.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
    include: {
      _count: {
        select: { recipes: true },
      },
    },
  })

  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  if (action === 'delete') {
    // Delete tag and all relationships (cascade)
    await (prisma as any).tag.delete({
      where: { id },
    })
    return NextResponse.json({
      success: true,
      message: `Tag "${tag.name}" and its ${tag._count.recipes} recipe associations have been deleted`,
    })
  } else {
    // Detach: remove tag from all recipes but keep tag record
    await (prisma as any).recipeTag.deleteMany({
      where: { tagId: id },
    })
    return NextResponse.json({
      success: true,
      message: `Tag "${tag.name}" has been removed from ${tag._count.recipes} recipes`,
    })
  }
}