import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const categories = await prisma.financeCategory.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }, { parentId: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: {
          transactions: true,
          recurringBills: true,
          incomeEntries: true,
        },
      },
    },
  })
  return NextResponse.json(categories)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal, isTaxDeduction } = json

  if (!name || !type) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Validate parent exists if provided
  let level = 0
  if (parentId) {
    const parent = await prisma.financeCategory.findFirst({
      where: { id: parentId, familyId: session.familyId },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Parent category not found' }, { status: 404 })
    }
    level = (parent.level ?? 0) + 1
    if (level > 1) {
      return NextResponse.json({ error: 'Maximum nesting depth is 2 (master/sub)' }, { status: 400 })
    }
  }

  const category = await prisma.financeCategory.create({
    data: {
      name,
      type,
      parentId: parentId ?? null,
      level,
      color: color ?? null,
      icon: icon ?? null,
      isPersonal: isPersonal ?? false,
      isLocationBased: isLocationBased ?? false,
      isExternal: isExternal ?? false,
      isTaxDeduction: isTaxDeduction ?? false,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(category, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal, isTaxDeduction } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeCategory.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Calculate new level if parentId changed
  let level = existing.level
  if (parentId !== undefined && parentId !== existing.parentId) {
    if (parentId) {
      const parent = await prisma.financeCategory.findFirst({
        where: { id: parentId, familyId: session.familyId },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent category not found' }, { status: 404 })
      }
      level = (parent.level ?? 0) + 1
      if (level > 1) {
        return NextResponse.json({ error: 'Maximum nesting depth is 2 (master/sub)' }, { status: 400 })
      }
    } else {
      level = 0
    }
  }

  const category = await prisma.financeCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(parentId !== undefined && { parentId: parentId ?? null }),
      ...(level !== existing.level && { level }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(isPersonal !== undefined && { isPersonal }),
      ...(isLocationBased !== undefined && { isLocationBased }),
      ...(isExternal !== undefined && { isExternal }),
      ...(isTaxDeduction !== undefined && { isTaxDeduction }),
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