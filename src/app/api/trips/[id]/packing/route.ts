import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// POST /api/trips/[id]/packing — create a packing list for the trip
// Optionally clone from a template: ?templateId=xxx
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const templateId = searchParams.get('templateId')

  // Verify trip exists and belongs to family
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  // Check if trip already has a packing list
  if (trip.packingListId) {
    return NextResponse.json(
      { error: 'Trip already has a packing list' },
      { status: 409 }
    )
  }

  const body = templateId ? {} : await req.json()
  const listName = body.name ?? `Packing: ${trip.destination}`

  // Create the packing list
  const list = await prisma.list.create({
    data: {
      name: listName,
      type: 'TODO', // Packing list uses TODO type for checklist behaviour
      familyId: user.familyId,
      createdBy: user.id,
      // Link the trip via the packingList relation (reverse side — handled by Trip update below)
    },
  })

  // Link the trip to this packing list
  await prisma.trip.update({
    where: { id },
    data: { packingListId: list.id },
  })

  // If a template was specified, clone items from it
  if (templateId) {
    const template = await prisma.listTemplate.findFirst({
      where: { id: templateId, familyId: user.familyId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    if (template) {
      await prisma.listItem.createMany({
        data: template.items.map((item) => ({
          content: item.content,
          category: item.category,
          sortOrder: item.sortOrder,
          listId: list.id,
          createdBy: user.id,
        })),
      })
    }
  }

  // Return the full packing list
  const fullList = await prisma.list.findUnique({
    where: { id: list.id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(
    {
      ...fullList,
      createdAt: fullList!.createdAt.toISOString(),
      items: fullList!.items.map((item) => ({
        ...item,
        dueDate: item.dueDate?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    },
    { status: 201 }
  )
}

// DELETE /api/trips/[id]/packing — unlink the packing list from the trip
// Query param ?deleteList=true to also delete the list itself
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const deleteList = searchParams.get('deleteList') === 'true'

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  if (!trip.packingListId) {
    return NextResponse.json({ error: 'Trip has no packing list' }, { status: 404 })
  }

  const listId = trip.packingListId

  // Unlink from trip first
  await prisma.trip.update({
    where: { id },
    data: { packingListId: null },
  })

  // Optionally delete the list
  if (deleteList) {
    await prisma.list.delete({ where: { id: listId } })
  }

  return NextResponse.json({ success: true })
}
