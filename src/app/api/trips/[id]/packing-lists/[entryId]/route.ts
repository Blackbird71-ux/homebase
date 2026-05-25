import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// PATCH /api/trips/[id]/packing-lists/[entryId] — rename the label
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, entryId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const entry = await prisma.tripPackingEntry.findFirst({
    where: { id: entryId, tripId: id },
  })
  if (!entry) return NextResponse.json({ error: 'Packing entry not found' }, { status: 404 })

  const body = await req.json()
  const { label, sortOrder } = body

  const updated = await prisma.tripPackingEntry.update({
    where: { id: entryId },
    data: {
      ...(label !== undefined ? { label: label?.trim() || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })

  return NextResponse.json({ ...updated, createdAt: updated.createdAt.toISOString() })
}

// DELETE /api/trips/[id]/packing-lists/[entryId]?deleteList=true|false
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, entryId } = await params
  const { searchParams } = new URL(req.url)
  const deleteList = searchParams.get('deleteList') !== 'false'  // default true

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const entry = await prisma.tripPackingEntry.findFirst({
    where: { id: entryId, tripId: id },
  })
  if (!entry) return NextResponse.json({ error: 'Packing entry not found' }, { status: 404 })

  const listId = entry.listId

  await prisma.tripPackingEntry.delete({ where: { id: entryId } })

  if (deleteList) {
    // Only delete the list if it's not linked to another trip
    const otherLinks = await prisma.tripPackingEntry.count({ where: { listId } })
    if (otherLinks === 0) {
      await prisma.list.delete({ where: { id: listId } })
    }
  }

  return NextResponse.json({ success: true })
}
