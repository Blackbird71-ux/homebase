import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { MaintenanceClient } from './MaintenanceClient'

export default async function MaintenancePage() {
  const user = await requireSession()

  const assets = await prisma.homeAsset.findMany({
    where: { familyId: user.familyId, isActive: true },
    include: {
      records: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { id: true, date: true, description: true, nextDueDate: true, nextDueOdometer: true },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  const serialized = assets.map(a => ({
    ...a,
    purchaseDate: a.purchaseDate?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    records: a.records.map(r => ({
      ...r,
      date: r.date.toISOString(),
      nextDueDate: r.nextDueDate?.toISOString() ?? null,
    })),
  }))

  return <MaintenanceClient initialAssets={serialized} />
}
