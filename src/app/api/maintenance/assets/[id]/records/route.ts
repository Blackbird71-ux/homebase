import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

export const POST = withRouteErrors(_POST)
