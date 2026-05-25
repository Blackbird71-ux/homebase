import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()

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

export async function POST(req: Request) {
  const user = await requireSession()
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
