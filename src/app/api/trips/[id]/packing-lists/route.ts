import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// GET /api/trips/[id]/packing-lists — list all packing lists for a trip
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const entries = await prisma.tripPackingEntry.findMany({
    where: { tripId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      list: {
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { items: { where: { isCompleted: false } } } },
        },
      },
    },
  })

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      tripId: e.tripId,
      listId: e.listId,
      label: e.label,
      sortOrder: e.sortOrder,
      createdAt: e.createdAt.toISOString(),
      list: {
        id: e.list.id,
        name: e.list.name,
        type: e.list.type,
        isActive: e.list.isActive,
        categoryOrder: e.list.categoryOrder,
        sortOrder: e.list.sortOrder,
        createdAt: e.list.createdAt.toISOString(),
        _count: { items: e.list._count.items },
        items: e.list.items.map((item) => ({
          id: item.id,
          content: item.content,
          isCompleted: item.isCompleted,
          isLocked: item.isLocked,
          category: item.category,
          sortOrder: item.sortOrder,
          dueDate: item.dueDate?.toISOString() ?? null,
          recipeId: item.recipeId,
          recipeName: item.recipeName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          createdBy: item.createdBy,
          assignedToUserId: item.assignedToUserId,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    })),
  )
}

// POST /api/trips/[id]/packing-lists — create a new named packing list
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true, destination: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const body = await req.json()
  const { name, label } = body

  const listName = name?.trim() || `Packing: ${trip.destination}`

  const maxOrder = await prisma.tripPackingEntry.aggregate({
    where: { tripId: id },
    _max: { sortOrder: true },
  })

  // Create the List and link it via TripPackingEntry in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const list = await tx.list.create({
      data: {
        name: listName,
        type: 'TODO',
        familyId: user.familyId,
        createdBy: user.id,
      },
    })

    const entry = await tx.tripPackingEntry.create({
      data: {
        tripId: id,
        listId: list.id,
        label: label?.trim() || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
      include: {
        list: {
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
            _count: { select: { items: { where: { isCompleted: false } } } },
          },
        },
      },
    })

    return entry
  })

  return NextResponse.json(
    {
      id: result.id,
      tripId: result.tripId,
      listId: result.listId,
      label: result.label,
      sortOrder: result.sortOrder,
      createdAt: result.createdAt.toISOString(),
      list: {
        id: result.list.id,
        name: result.list.name,
        type: result.list.type,
        isActive: result.list.isActive,
        categoryOrder: result.list.categoryOrder,
        sortOrder: result.list.sortOrder,
        createdAt: result.list.createdAt.toISOString(),
        _count: { items: result.list._count.items },
        items: result.list.items.map((item) => ({
          id: item.id,
          content: item.content,
          isCompleted: item.isCompleted,
          isLocked: item.isLocked,
          category: item.category,
          sortOrder: item.sortOrder,
          dueDate: item.dueDate?.toISOString() ?? null,
          recipeId: item.recipeId,
          recipeName: item.recipeName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          createdBy: item.createdBy,
          assignedToUserId: item.assignedToUserId,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    },
    { status: 201 },
  )
}
