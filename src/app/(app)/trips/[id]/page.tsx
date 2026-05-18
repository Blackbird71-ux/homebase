import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { TripDetailClient } from './TripDetailClient'

export const metadata = {
  title: 'Trip Details',
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireSession()
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
      packingEntries: {
        orderBy: { sortOrder: 'asc' },
        include: {
          list: {
            include: {
              items: { orderBy: { sortOrder: 'asc' } },
              _count: { select: { items: { where: { isCompleted: false } } } },
            },
          },
        },
      },
      days: {
        orderBy: { date: 'asc' },
        include: {
          activities: {
            orderBy: { sortOrder: 'asc' },
            include: {
              tags: {
                include: { tag: true },
              },
            },
          },
          tags: {
            include: { tag: true },
          },
        },
      },
    },
  })

  if (!trip) {
    notFound()
  }

  const serialized = {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    departureLocation: trip.departureLocation ?? null,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    accommodation: trip.accommodation,
    transport: trip.transport,
    notes: trip.notes,
    status: trip.status,
    color: trip.color,
    icon: trip.icon,
    estimatedBudget: trip.estimatedBudget ?? null,
    actualCost: trip.actualCost ?? null,
    budgetBreakdown: trip.budgetBreakdown ?? null,
    createdBy: trip.createdBy,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),

    days: trip.days.map((day) => ({
      id: day.id,
      date: day.date.toISOString(),
      label: day.label,
      notes: day.notes,
      sortOrder: day.sortOrder,
      createdAt: day.createdAt.toISOString(),
      tags: day.tags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        emoji: t.tag.emoji,
        color: t.tag.color,
      })),
      activities: day.activities.map((act) => ({
        id: act.id,
        title: act.title,
        location: act.location,
        locationLat: act.locationLat ?? null,
        locationLng: act.locationLng ?? null,
        startTime: act.startTime?.toISOString() ?? null,
        endTime: act.endTime?.toISOString() ?? null,
        notes: act.notes,
        category: act.category,
        sortOrder: act.sortOrder,
        createdAt: act.createdAt.toISOString(),
        tags: act.tags.map((t) => ({
          id: t.tag.id,
          name: t.tag.name,
          emoji: t.tag.emoji,
          color: t.tag.color,
        })),
      })),
    })),

    // Legacy single packing list
    packingList: trip.packingList
      ? {
          id: trip.packingList.id,
          name: trip.packingList.name,
          type: trip.packingList.type,
          isActive: trip.packingList.isActive,
          categoryOrder: trip.packingList.categoryOrder,
          sortOrder: trip.packingList.sortOrder,
          items: trip.packingList.items.map((item) => ({
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
          _count: { items: trip.packingList._count.items },
          createdAt: trip.packingList.createdAt.toISOString(),
        }
      : null,

    // New: multiple named packing lists
    packingEntries: trip.packingEntries.map((e) => ({
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
  }

  return <TripDetailClient trip={serialized} currentUserId={user.id} />
}
