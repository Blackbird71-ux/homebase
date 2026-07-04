import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assets = await prisma.homeAsset.findMany({
    where: { familyId: user.familyId, isActive: true },
    include: {
      records: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { id: true, date: true, description: true, nextDueDate: true, nextDueOdometer: true },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(assets)
}

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, category, make, model, year, serialNumber, purchaseDate, notes } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const asset = await prisma.homeAsset.create({
    data: {
      familyId: user.familyId,
      name: name.trim(),
      category: category ?? 'other',
      make: make ?? null,
      model: model ?? null,
      year: year ?? null,
      serialNumber: serialNumber ?? null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      notes: notes ?? null,
    },
    include: {
      records: { orderBy: { date: 'desc' }, take: 1 },
    },
  })

  return NextResponse.json(asset, { status: 201 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
