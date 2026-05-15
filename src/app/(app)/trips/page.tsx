import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { TripsClient } from './TripsClient'

export const metadata = {
  title: 'Trips',
}

export default async function TripsPage() {
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
    estimatedBudget: t.estimatedBudget,
    actualCost: t.actualCost,
    budgetBreakdown: t.budgetBreakdown,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))

  return <TripsClient initialTrips={serialized} currentUserId={user.id} />
}
