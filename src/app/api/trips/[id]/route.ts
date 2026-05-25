import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// GET /api/trips/[id] — get a single trip
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      packingList: {
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { items: { where: { isCompleted: false } } } },
        },
      },
    },
  })

  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...trip,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    packingList: trip.packingList
      ? {
          ...trip.packingList,
          createdAt: trip.packingList.createdAt.toISOString(),
          items: trip.packingList.items.map((item) => ({
            ...item,
            dueDate: item.dueDate?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
          })),
        }
      : null,
  })
}

// PATCH /api/trips/[id] — update a trip
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  // Verify ownership
  const existing = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const {
    title,
    destination,
    startDate,
    endDate,
    accommodation,
    transport,
    notes,
    status,
    color,
    icon,
    estimatedBudget,
    actualCost,
    budgetBreakdown,
  } = body

  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (destination !== undefined) updateData.destination = destination
  if (startDate !== undefined) updateData.startDate = new Date(startDate)
  if (endDate !== undefined) updateData.endDate = new Date(endDate)
  if (accommodation !== undefined) updateData.accommodation = accommodation
  if (transport !== undefined) updateData.transport = transport
  if (notes !== undefined) updateData.notes = notes
  if (status !== undefined) updateData.status = status
  if (color !== undefined) updateData.color = color
  if (icon !== undefined) updateData.icon = icon
  if (estimatedBudget !== undefined) updateData.estimatedBudget = estimatedBudget
  if (actualCost !== undefined) updateData.actualCost = actualCost
  if (budgetBreakdown !== undefined) updateData.budgetBreakdown = budgetBreakdown

  const trip = await prisma.trip.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({
    ...trip,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  })
}

// DELETE /api/trips/[id] — delete a trip
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  await prisma.trip.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
