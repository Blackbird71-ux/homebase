import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// Valid Chart of Accounts types — includes balance-sheet types (asset, liability, equity)
// as well as the original P&L types (income, expense, transfer).
const VALID_TYPES = ['income', 'expense', 'transfer', 'asset', 'liability', 'equity'] as const

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  // forPicker=true: exclude the "NOT IN USE" archive root and its children from pickers.
  const forPicker = searchParams.get('forPicker') === 'true'

  // forPicker: exclude the "NOT IN USE" archive root and all its children
  let pickerExcludeIds: string[] = []
  if (forPicker) {
    const notInUse = await prisma.financeCategory.findFirst({
      where: { familyId: session.familyId, name: 'NOT IN USE', parentId: null },
      select: { id: true },
    })
    if (notInUse) {
      const children = await prisma.financeCategory.findMany({
        where: { familyId: session.familyId, parentId: notInUse.id },
        select: { id: true },
      })
      pickerExcludeIds = [notInUse.id, ...children.map(c => c.id)]
    }
  }

  const categories = await prisma.financeCategory.findMany({
    where: {
      familyId: session.familyId,
      ...(forPicker && pickerExcludeIds.length > 0 ? { id: { notIn: pickerExcludeIds } } : {}),
    },
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
  const { name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal, isTaxDeduction, taxIncludeInReporting, taxDisplayLabel, glCode, gstApplicable, gstRate } = json

  if (!name || !type) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
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
      taxIncludeInReporting: taxIncludeInReporting ?? false,
      taxDisplayLabel: taxDisplayLabel ?? null,
      glCode: glCode ?? null,
      gstApplicable: gstApplicable ?? false,
      gstRate: gstRate != null ? parseFloat(gstRate) : 10,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(category, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, parentId, color, icon, isPersonal, isLocationBased, isExternal, isTaxDeduction, taxIncludeInReporting, taxDisplayLabel, glCode, gstApplicable, gstRate } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeCategory.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
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
      ...(taxIncludeInReporting !== undefined && { taxIncludeInReporting }),
      ...(taxDisplayLabel !== undefined && { taxDisplayLabel }),
      ...(glCode !== undefined && { glCode: glCode ?? null }),
      ...(gstApplicable !== undefined && { gstApplicable }),
      ...(gstRate !== undefined && { gstRate: parseFloat(gstRate) }),
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
