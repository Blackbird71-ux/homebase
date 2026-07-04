import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

async function _GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  // ── Bootstrap: ensure every family has a default "Personal / Family" entity ──
  // This runs once per family (idempotent: upsert-style check before creating).
  const hasDefault = await prisma.financeEntity.findFirst({
    where: { familyId: user.familyId, isDefault: true },
    select: { id: true },
  })
  if (!hasDefault) {
    await prisma.financeEntity.create({
      data: {
        name: 'Personal / Family',
        type: 'personal',
        description: 'Default household income and expenses',
        color: '#6366F1',
        isDefault: true,
        sortOrder: 0,
        isActive: true,
        familyId: user.familyId,
      },
    })
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const entities = await prisma.financeEntity.findMany({
    where: {
      familyId: user.familyId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(entities)
}

async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { name, type, description, color, icon, isDefault, sortOrder } = json

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // If this is marked default, clear any existing default
  if (isDefault) {
    await prisma.financeEntity.updateMany({
      where: { familyId: user.familyId, isDefault: true },
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
      familyId: user.familyId,
    },
  })

  return NextResponse.json(entity, { status: 201 })
}

async function _PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, name, type, description, color, icon, isDefault, sortOrder, isActive } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeEntity.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

  // If this is marked default, clear any other defaults
  if (isDefault) {
    await prisma.financeEntity.updateMany({
      where: { familyId: user.familyId, isDefault: true, id: { not: id } },
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

async function _DELETE(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeEntity.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  if (existing.isDefault) return NextResponse.json({ error: 'Cannot delete the default entity' }, { status: 400 })

  // Soft-delete: just deactivate so linked bills/budgets retain history
  await prisma.financeEntity.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
