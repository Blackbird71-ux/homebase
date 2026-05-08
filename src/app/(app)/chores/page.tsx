import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ChoresClient } from './ChoresClient'
import { todayBoundsInTz } from '@/lib/timezone'

export default async function ChoresPage() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'UTC'

  // Get today's start boundary in the user's timezone for overdue comparison
  const { start: todayStart } = todayBoundsInTz(timezone)

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
      <div className="p-6 pb-0 shrink-0">
        <h1 className="text-2xl font-bold">Chores</h1>
        <p className="text-muted-foreground mt-1">Manage recurring household tasks and assignments.</p>
      </div>
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
            isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
          })) as any[]}
          members={members}
        />
      </div>
    </div>
  )
}
