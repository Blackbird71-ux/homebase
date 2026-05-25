import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { todayBoundsInTz } from '@/lib/timezone'
import { calculateNextDueDate } from '@/lib/chore-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { end: todayEnd } = todayBoundsInTz(timezone)

  // nextDueDate is stored as the UTC equivalent of midnight in the user's timezone,
  // so simple Date comparisons work correctly regardless of UTC offset.
  if (!chore.allowEarlyStart && chore.nextDueDate && chore.nextDueDate > todayEnd) {
    return NextResponse.json(
      { error: 'This chore is not yet due. Enable "Allow early completion" on the chore to complete it ahead of schedule.' },
      { status: 422 }
    )
  }

  // Record the completion
  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: id,
      completedById: user.id,
      note: body.note ?? null,
    },
    include: {
      completedBy: { select: { id: true, name: true } },
    },
  })

  // Calculate next due date using the canonical helper.
  // Rule: advance from nextDueDate (not now) to keep the schedule anchored.
  const nextDueDate = calculateNextDueDate(chore, new Date(), timezone)

  // Prepare update data
  const updateData: Record<string, unknown> = {}

  if (nextDueDate === null) {
    // End date reached — deactivate chore
    updateData.isActive = false
    updateData.nextDueDate = null
  } else {
    updateData.nextDueDate = nextDueDate
  }

  // Auto-rotate assignee if enabled — respects rotationInterval
  if (chore.autoRotateOnComplete) {
    // Count total completions for this chore to determine rotation position
    const completionCount = await prisma.choreCompletion.count({
      where: { choreId: id },
    })

    const interval = chore.rotationInterval ?? 1
    // Rotate when completionCount is evenly divisible by rotationInterval.
    // e.g. interval=3 → rotate on 3rd, 6th, 9th completion
    if (completionCount % interval === 0) {
      const members = await prisma.user.findMany({
        where: { familyId: user.familyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      if (members.length > 0) {
        let nextIndex = 0
        if (chore.currentAssigneeId) {
          const currentIndex = members.findIndex((m) => m.id === chore.currentAssigneeId)
          nextIndex = (currentIndex + 1) % members.length
        }
        updateData.currentAssigneeId = members[nextIndex].id
      }
    }
  }

  // Update the chore
  const updated = await prisma.chore.update({
    where: { id },
    data: updateData,
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
      _count: { select: { completions: true } },
    },
  })

  return NextResponse.json({
    completion,
    chore: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      completions: updated.completions.map((c) => ({
        ...c,
        completedAt: c.completedAt.toISOString(),
      })),
    },
  })
}
