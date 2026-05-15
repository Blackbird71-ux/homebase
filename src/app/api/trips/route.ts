import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// GET /api/trips — list all trips for the family
export async function GET() {
  const user = await requireSession()

  const trips = await prisma.trip.findMany({
    where: { familyId: user.familyId },
    orderBy: { startDate: 'asc' },
    include: {
      packingList: {
        select: {
          id: true,
          name: true,
          items: {
            where: { isCompleted: false },
            select: { id: true },
          },
        },
      },
    },
  })

  const serialized = trips.map((t) => ({
    id: t.id,
    title: t.title,
    destination: t.destination,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    accommodation: t.accommodation,
    transport: t.transport,
    notes: t.notes,
    status: t.status,
    color: t.color,
    icon: t.icon,
    packingList: t.packingList
      ? {
          id: t.packingList.id,
          name: t.packingList.name,
          pendingItems: t.packingList.items.length,
        }
      : null,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))

  return NextResponse.json(serialized)
}

// POST /api/trips — create a new trip
export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, destination, startDate, endDate, accommodation, transport, notes, status, color, icon, estimatedBudget, budgetBreakdown } = body

  if (!title || !destination || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'title, destination, startDate, and endDate are required' },
      { status: 400 }
    )
  }

  if (new Date(endDate) <= new Date(startDate)) {
    return NextResponse.json(
      { error: 'endDate must be after startDate' },
      { status: 400 }
    )
  }

  const trip = await prisma.trip.create({
    data: {
      title,
      destination,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      accommodation: accommodation ?? null,
      transport: transport ?? null,
      notes: notes ?? null,
      status: status ?? 'planning',
      color: color ?? null,
      icon: icon ?? null,
      estimatedBudget: estimatedBudget ?? null,
      budgetBreakdown: budgetBreakdown ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json(
    {
      ...trip,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    },
    { status: 201 }
  )
}
