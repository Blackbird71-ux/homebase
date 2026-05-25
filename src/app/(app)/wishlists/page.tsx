import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { WishlistsClient } from './WishlistsClient'

export default async function WishlistsPage() {
  const user = await requireSession()

  const [items, contacts, members] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { familyId: user.familyId },
      include: {
        contact: { select: { id: true, name: true } },
        suggestedBy: { select: { id: true, name: true } },
        purchasedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ isPurchased: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.householdContact.findMany({
      where: { familyId: user.familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { familyId: user.familyId },
      select: { id: true, name: true },
    }),
  ])

  const serializedItems = items.map(i => ({
    ...i,
    purchasedAt: i.purchasedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }))

  return (
    <WishlistsClient
      initialItems={serializedItems}
      contacts={contacts}
      members={members}
      currentUserId={user.id}
    />
  )
}
