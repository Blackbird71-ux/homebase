import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const locations = await prisma.financeLocation.findMany({
    where: { familyId: session.familyId },
    orderBy: { sortOrder: 'asc' },
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
  return NextResponse.json(locations)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, address, type, color, icon } = json

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const maxOrder = await prisma.financeLocation.findFirst({
    where: { familyId: session.familyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const location = await prisma.financeLocation.create({
    data: {
      name,
      address: address ?? null,
      type: type ?? 'primary',
      color: color ?? null,
      icon: icon ?? null,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(location, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, address, type, color, icon, isActive } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeLocation.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const location = await prisma.financeLocation.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(type !== undefined && { type }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json(location)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeLocation.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  await prisma.financeLocation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}