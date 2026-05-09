import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addYears } from 'date-fns'

export async function GET() {
  const session = await requireSession()
  const entities = await prisma.financeEntity.findMany({
    where: { familyId: session.familyId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(entities)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, type, description, color, icon, isDefault, sortOrder } = json

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // If this is marked default, clear any existing default
  if (isDefault) {
    await prisma.financeEntity.updateMany({
      where: { familyId: session.familyId, isDefault: true },
      data: { isDefault: false },
    })
  }

  const entity = await prisma.financeEntity.create({
    data: {
      name: name.trim(),
      type: type ?? 'personal',
      description: description ?? null,
      color: color ?? null,
      icon: icon ?? null,
      isDefault: isDefault ?? false,
      sortOrder: sortOrder ?? 0,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(entity, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, description, color, icon, isDefault, sortOrder, isActive } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeEntity.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

  // If this is marked default, clear any other defaults
  if (isDefault) {
    await prisma.financeEntity.updateMany({
      where: { familyId: session.familyId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    })
  }

  const entity = await prisma.financeEntity.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(description !== undefined && { description: description || null }),
      ...(color !== undefined && { color: color || null }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(isDefault !== undefined && { isDefault }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json(entity)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeEntity.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  if (existing.isDefault) return NextResponse.json({ error: 'Cannot delete the default entity' }, { status: 400 })

  // Soft-delete: just deactivate so linked bills/budgets retain history
  await prisma.financeEntity.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}
