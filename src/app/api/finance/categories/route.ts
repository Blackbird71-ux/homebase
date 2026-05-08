import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const categories = await prisma.financeCategory.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(categories)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, type, parentId, color, icon } = json

  if (!name || !type) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Validate parent exists if provided
  if (parentId) {
    const parent = await prisma.financeCategory.findFirst({
      where: { id: parentId, familyId: session.familyId },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Parent category not found' }, { status: 404 })
    }
  }

  const category = await prisma.financeCategory.create({
    data: {
      name,
      type,
      parentId: parentId ?? null,
      color: color ?? null,
      icon: icon ?? null,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(category, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, parentId, color, icon } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeCategory.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const category = await prisma.financeCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(parentId !== undefined && { parentId: parentId ?? null }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
    },
  })

  return NextResponse.json(category)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeCategory.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Check for child categories
  const children = await prisma.financeCategory.count({ where: { parentId: id } })
  if (children > 0) {
    return NextResponse.json({ error: 'Cannot delete category with subcategories' }, { status: 400 })
  }

  await prisma.financeCategory.delete({ where: { id } })
  return NextResponse.json({ success: true })
}