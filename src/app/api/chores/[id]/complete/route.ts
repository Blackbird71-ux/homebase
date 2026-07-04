import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { todayBoundsInTz } from '@/lib/timezone'
import { completeChore } from '@/lib/chore-completion'

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Verify chore exists and belongs to family
  const chore = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!chore) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const timezone = user.timezone ?? 'UTC'
  const { start: todayStart } = todayBoundsInTz(timezone)

  // Run the shared completion lifecycle (gate → record → advance → rotate).
  const result = await completeChore(chore, {
    completedById: user.id,
    note: body.note ?? null,
    timezone,
    clientMutationId: body.clientMutationId ?? null,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'This chore is not yet due. Enable "Allow early completion" on the chore to complete it ahead of schedule.' },
      { status: 422 }
    )
  }

  const { completion, chore: updated } = result

  return NextResponse.json({
    completion,
    chore: {
      ...updated,
      // Mirror the GET/PATCH routes so the client refreshes the overdue badge
      // after completion instead of keeping the stale pre-completion value.
      isOverdue: updated.nextDueDate ? updated.nextDueDate < todayStart : false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      completions: updated.completions.map((c) => ({
        ...c,
        completedAt: c.completedAt.toISOString(),
      })),
    },
  })
}

export const POST = withRouteErrors(_POST)
