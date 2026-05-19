import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ChoresClient } from './ChoresClient'
import { todayBoundsInTz } from '@/lib/timezone'
import { PageHero } from '@/components/shared/PageHero'

export default async function ChoresPage() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'UTC'

  // Get today's boundary (start of today in user's timezone) for comparing stored nextDueDate
  const { start: todayStart } = todayBoundsInTz(timezone)

  const weekStartsOn = (user.weekStartsOn ?? 0) as 0 | 1

  const [chores, members] = await Promise.all([
    prisma.chore.findMany({
      where: { familyId: user.familyId, isActive: true },
      include: {
        currentAssignee: { select: { id: true, name: true } },
        completions: {
          orderBy: { completedAt: 'desc' },
          take: 1,
          include: { completedBy: { select: { id: true, name: true } } },
        },
        _count: { select: { completions: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { familyId: user.familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHero title="Chores" subtitle="Manage recurring household tasks and assignments." />
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <ChoresClient
          currentUserId={user.id}
          initialChores={chores.map((c) => ({
            ...c,
            startDate: c.startDate?.toISOString() ?? null,
            endDate: c.endDate?.toISOString() ?? null,
            nextDueDate: c.nextDueDate?.toISOString() ?? null,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            completions: c.completions.map((comp) => ({
              ...comp,
              completedAt: comp.completedAt.toISOString(),
            })),
            // nextDueDate is now stored as the UTC equivalent of midnight in the user's
            // timezone, so a simple Date comparison is correct.
            isOverdue: c.nextDueDate ? new Date(c.nextDueDate) < todayStart : false,
          })) as any[]}
          members={members}
          weekStartsOn={weekStartsOn}
        />
      </div>
    </div>
  )
}
