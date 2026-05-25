import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const asset = await prisma.homeAsset.findUnique({
    where: { id },
    include: {
      records: { orderBy: { date: 'desc' } },
    },
  })

  if (!asset || asset.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(asset)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.homeAsset.findUnique({ where: { id } })
  if (!existing || existing.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { name, category, make, model, year, serialNumber, purchaseDate, notes, isActive } = body
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name.trim()
  if (category !== undefined) data.category = category
  if (make !== undefined) data.make = make ?? null
  if (model !== undefined) data.model = model ?? null
  if (year !== undefined) data.year = year ?? null
  if (serialNumber !== undefined) data.serialNumber = serialNumber ?? null
  if (purchaseDate !== undefined) data.purchaseDate = purchaseDate ? new Date(purchaseDate) : null
  if (notes !== undefined) data.notes = notes ?? null
  if (isActive !== undefined) data.isActive = isActive

  const updated = await prisma.homeAsset.update({
    where: { id },
    data,
    include: { records: { orderBy: { date: 'desc' }, take: 1 } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.homeAsset.findUnique({ where: { id } })
  if (!existing || existing.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.homeAsset.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
