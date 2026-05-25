import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id: assetId } = await params

  const asset = await prisma.homeAsset.findUnique({ where: { id: assetId } })
  if (!asset || asset.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { date, description, cost, odometer, notes, nextDueDate, nextDueOdometer } = body

  if (!date || !description?.trim()) {
    return NextResponse.json({ error: 'date and description are required' }, { status: 400 })
  }

  const record = await prisma.maintenanceRecord.create({
    data: {
      familyId: user.familyId,
      assetId,
      date: new Date(date),
      description: description.trim(),
      cost: cost ?? null,
      odometer: odometer ?? null,
      notes: notes ?? null,
      nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      nextDueOdometer: nextDueOdometer ?? null,
    },
  })

  return NextResponse.json(record, { status: 201 })
}
