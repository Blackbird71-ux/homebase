/**
 * chore-completion.ts — Single source of truth for the chore COMPLETION lifecycle.
 *
 * WHY THIS FILE EXISTS:
 * The "complete a chore" lifecycle (record completion → advance next due date →
 * rotate the assignee) was previously hand-rolled inline in three separate
 * entry points that had already drifted apart:
 *   • src/app/api/chores/[id]/complete/route.ts  (in-app button) — correct
 *   • src/app/api/complete/route.ts              (email link)    — rotated EVERY time
 *   • src/lib/ai/tools/chores.tool.ts            (AI assistant)  — never rotated
 * Now every entry point calls completeChore() so the behaviour is identical
 * everywhere. The rotation index math lives in nextAssigneeId(), shared with the
 * manual rotate route.
 *
 * This file performs DB writes, so it is SERVER-ONLY. Pure date math stays in
 * chore-helpers.ts (which is also imported by client components — keep it free
 * of prisma).
 */

import { prisma } from '@/lib/prisma'
import { todayBoundsInTz } from '@/lib/timezone'
import { calculateNextDueDate, type ChoreForSchedule } from '@/lib/chore-helpers'
import { awardChoreReward } from '@/lib/pocket-money'

// The chore fields completeChore needs on top of the schedule fields. A full
// prisma.chore record is a structural superset, so callers pass it directly.
type ChoreForCompletion = ChoreForSchedule & {
  id: string
  title: string
  familyId: string
  autoRotateOnComplete: boolean
  rotationInterval: number | null
  currentAssigneeId: string | null
  rewardAmount: number | null
}

/**
 * Next assignee in a name-ordered rotation. Returns null only when there are no
 * members. With no current assignee, rotation starts at the first member.
 */
export function nextAssigneeId(
  currentAssigneeId: string | null,
  members: { id: string }[]
): string | null {
  if (members.length === 0) return null
  if (!currentAssigneeId) return members[0].id
  const currentIndex = members.findIndex((m) => m.id === currentAssigneeId)
  return members[(currentIndex + 1) % members.length].id
}

/**
 * Complete a chore from any entry point (in-app, email link, AI assistant).
 *
 * Steps, identical everywhere:
 *   1. Early-completion gate — refuse if not yet due unless allowEarlyStart.
 *   2. Record the ChoreCompletion.
 *   3. Advance nextDueDate via the canonical helper (deactivate on end date).
 *   4. Rotate the assignee when autoRotateOnComplete is set, respecting
 *      rotationInterval (rotate only when completionCount % interval === 0).
 *
 * Returns { ok:false, reason:'not-due' } when the gate blocks completion — the
 * caller formats the refusal (422 JSON / HTML page / AI message). On success,
 * returns the created completion and the updated chore (with the same includes
 * the routes use for their responses).
 */
export async function completeChore(
  chore: ChoreForCompletion,
  opts: { completedById: string; note?: string | null; timezone: string; clientMutationId?: string | null }
) {
  // 0. Idempotent offline-replay guard: if this clientMutationId already
  // completed the chore (e.g. the response was lost and the offline queue
  // replays the POST), return the existing completion without advancing the
  // schedule or rotating the assignee a second time.
  if (opts.clientMutationId) {
    const existing = await prisma.choreCompletion.findUnique({
      where: { clientMutationId: opts.clientMutationId },
      include: { completedBy: { select: { id: true, name: true } } },
    })
    if (existing) {
      const current = await prisma.chore.findUniqueOrThrow({
        where: { id: chore.id },
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
      return { ok: true as const, completion: existing, chore: current }
    }
  }

  const { end: todayEnd } = todayBoundsInTz(opts.timezone)

  // 1. Early-completion gate. nextDueDate is stored as the UTC equivalent of
  // local midnight, so a direct Date comparison is correct. todayEnd is
  // tomorrow's local midnight (exclusive): a chore due today sits before it and
  // is completable; a chore due tomorrow sits exactly AT it and must be gated —
  // hence `>=` (mirror of choreIsCompletable's strict `<`).
  if (!chore.allowEarlyStart && chore.nextDueDate && chore.nextDueDate >= todayEnd) {
    return { ok: false as const, reason: 'not-due' as const }
  }

  // 2. Record the completion.
  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedById: opts.completedById,
      note: opts.note ?? null,
      clientMutationId: opts.clientMutationId ?? null,
    },
    include: {
      completedBy: { select: { id: true, name: true } },
    },
  })

  // 2b. Award pocket money for rewarded chores (no-op when rewardAmount is
  // unset; idempotent; never throws — see pocket-money.ts).
  await awardChoreReward(chore, completion)

  // 3. Advance the schedule.
  const nextDueDate = calculateNextDueDate(chore, new Date(), opts.timezone)
  const updateData: Record<string, unknown> =
    nextDueDate === null ? { isActive: false, nextDueDate: null } : { nextDueDate }

  // 4. Rotate the assignee, respecting rotationInterval.
  if (chore.autoRotateOnComplete) {
    const completionCount = await prisma.choreCompletion.count({
      where: { choreId: chore.id },
    })
    const interval = chore.rotationInterval ?? 1
    // e.g. interval=3 → rotate on the 3rd, 6th, 9th completion.
    if (completionCount % interval === 0) {
      const members = await prisma.user.findMany({
        where: { familyId: chore.familyId },
        select: { id: true },
        orderBy: { name: 'asc' },
      })
      const next = nextAssigneeId(chore.currentAssigneeId, members)
      if (next) updateData.currentAssigneeId = next
    }
  }

  const updated = await prisma.chore.update({
    where: { id: chore.id },
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

  return { ok: true as const, completion, chore: updated }
}
