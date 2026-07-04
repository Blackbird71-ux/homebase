import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const locations = await prisma.financeLocation.findMany({
    where: { familyId: user.familyId },
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

async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { name, address, type, color, icon } = json

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const maxOrder = await prisma.financeLocation.findFirst({
    where: { familyId: user.familyId },
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
      familyId: user.familyId,
    },
  })

  return NextResponse.json(location, { status: 201 })
}

async function _PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, name, address, type, color, icon, isActive } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeLocation.findFirst({
    where: { id, familyId: user.familyId },
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

async function _DELETE(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeLocation.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  await prisma.financeLocation.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
