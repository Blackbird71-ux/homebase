import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import type { PantryLocation, PantryStatus } from '@/lib/pantry-helpers'
import { PantryClient } from './PantryClient'

export default async function PantryPage() {
  const user = await requireSession()

  const items = await prisma.pantryItem.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ location: 'asc' }, { name: 'asc' }],
  })

  const serialized = items.map(i => ({
    id: i.id,
    name: i.name,
    location: i.location as PantryLocation,
    status: i.status as PantryStatus,
    isStaple: i.isStaple,
    expiryDate: i.expiryDate?.toISOString() ?? null,
  }))

  return <PantryClient initialItems={serialized} />
}
