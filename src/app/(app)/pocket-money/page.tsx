import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getPocketMoneySummary } from '@/lib/pocket-money'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { PocketMoneyClient } from './PocketMoneyClient'

export default async function PocketMoneyPage() {
  const user = await requireSession()
  const timezone = user.timezone ?? DEFAULT_TIMEZONE

  const [summary, wishlistItems] = await Promise.all([
    getPocketMoneySummary(user.familyId, timezone),
    prisma.wishlistItem.findMany({
      where: { familyId: user.familyId, isPurchased: false },
      select: { id: true, title: true, estimatedPrice: true },
      orderBy: { title: 'asc' },
    }),
  ])

  return (
    <PocketMoneyClient
      initialSummary={summary}
      wishlistItems={wishlistItems}
      isAdmin={user.role === 'admin'}
      timezone={timezone}
    />
  )
}
