/**
 * pocket-money.ts — Single source of truth for pocket money (server-only).
 *
 * Pocket money is a standalone tracked balance, deliberately NOT part of the
 * finance module / GL (see ROADMAP.md §3.1). A user's balance is always
 * SUM(PocketMoneyEntry.amount) — never stored, so it cannot drift.
 *
 * Entry types:
 *   chore      — automatic award when a rewarded chore is completed
 *                (created by completeChore; idempotent via the unique
 *                choreCompletionId)
 *   adjustment — manual admin top-up or deduction (amount may be ±)
 *   redemption — spending the balance, optionally against a wishlist item
 *                (always negative)
 */

import { prisma } from '@/lib/prisma'
import { dateStringInTz, addLocalDays } from '@/lib/timezone'

/**
 * Award the chore's reward to the completer. Called from completeChore so
 * every entry point (in-app, email link, AI assistant) awards identically.
 * No-op when the chore has no reward. Never throws — a failed award must not
 * roll back an already-recorded completion.
 */
export async function awardChoreReward(
  chore: { id: string; title: string; familyId: string; rewardAmount: number | null },
  completion: { id: string; completedById: string }
): Promise<void> {
  if (!chore.rewardAmount || chore.rewardAmount <= 0) return
  try {
    await prisma.pocketMoneyEntry.create({
      data: {
        familyId: chore.familyId,
        userId: completion.completedById,
        amount: chore.rewardAmount,
        type: 'chore',
        note: chore.title,
        choreCompletionId: completion.id,
      },
    })
  } catch (err) {
    // Unique choreCompletionId makes replays a no-op; log anything else.
    if ((err as { code?: string }).code !== 'P2002') {
      console.error('[pocket-money] Failed to award chore reward:', err)
    }
  }
}

/**
 * Current streak: consecutive local days with at least one chore completion,
 * counting back from today. A day with no completion ends the streak — except
 * today, which doesn't break it until it's over (you can still complete one).
 * Pure — exported for tests.
 */
export function completionStreak(completionDayKeys: Set<string>, recentDayKeys: string[]): number {
  let streak = 0
  for (let i = 0; i < recentDayKeys.length; i++) {
    if (completionDayKeys.has(recentDayKeys[i])) {
      streak++
    } else if (i === 0) {
      continue // today isn't over yet
    } else {
      break
    }
  }
  return streak
}

const STREAK_LOOKBACK_DAYS = 365

export interface PocketMoneyMember {
  id: string
  name: string
  balance: number
  streak: number
}

export interface PocketMoneyEntryView {
  id: string
  userId: string
  userName: string
  amount: number
  type: string
  note: string | null
  createdAt: string
  createdByName: string | null
}

export interface PocketMoneySummary {
  members: PocketMoneyMember[]
  entries: PocketMoneyEntryView[]
}

/** Balances, streaks, and recent history for the whole family. */
export async function getPocketMoneySummary(familyId: string, timezone: string): Promise<PocketMoneySummary> {
  const streakStart = addLocalDays(new Date(), -STREAK_LOOKBACK_DAYS, timezone)

  const [users, sums, completions, entries] = await Promise.all([
    prisma.user.findMany({
      where: { familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.pocketMoneyEntry.groupBy({
      by: ['userId'],
      where: { familyId },
      _sum: { amount: true },
    }),
    prisma.choreCompletion.findMany({
      where: { chore: { familyId }, completedAt: { gte: streakStart } },
      select: { completedById: true, completedAt: true },
    }),
    prisma.pocketMoneyEntry.findMany({
      where: { familyId },
      include: {
        user: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const balanceByUser = new Map(sums.map((s) => [s.userId, s._sum.amount ?? 0]))

  // Day keys per user for the streak, all in the family's timezone.
  const dayKeysByUser = new Map<string, Set<string>>()
  for (const c of completions) {
    let keys = dayKeysByUser.get(c.completedById)
    if (!keys) dayKeysByUser.set(c.completedById, (keys = new Set()))
    keys.add(dateStringInTz(c.completedAt, timezone))
  }
  const now = new Date()
  const recentDayKeys = Array.from({ length: STREAK_LOOKBACK_DAYS }, (_, i) =>
    dateStringInTz(addLocalDays(now, -i, timezone), timezone)
  )

  return {
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      balance: balanceByUser.get(u.id) ?? 0,
      streak: completionStreak(dayKeysByUser.get(u.id) ?? new Set(), recentDayKeys),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.user.name,
      amount: e.amount,
      type: e.type,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      createdByName: e.createdBy?.name ?? null,
    })),
  }
}

async function userBalance(familyId: string, userId: string): Promise<number> {
  const sum = await prisma.pocketMoneyEntry.aggregate({
    where: { familyId, userId },
    _sum: { amount: true },
  })
  return sum._sum.amount ?? 0
}

/** Manual admin top-up or deduction. Amount may be positive or negative. */
export async function adjustPocketMoney(opts: {
  familyId: string
  userId: string
  amount: number
  note: string | null
  createdById: string
}) {
  return prisma.pocketMoneyEntry.create({
    data: {
      familyId: opts.familyId,
      userId: opts.userId,
      amount: opts.amount,
      type: 'adjustment',
      note: opts.note,
      createdById: opts.createdById,
    },
  })
}

/**
 * Spend from a user's balance, optionally against a wishlist item (which is
 * then marked purchased by that user). Refuses to overdraw.
 */
export async function redeemPocketMoney(opts: {
  familyId: string
  userId: string
  amount: number // positive — stored negated
  wishlistItemId: string | null
  note: string | null
  createdById: string
}): Promise<{ ok: true } | { ok: false; reason: 'insufficient-balance' | 'item-not-found' }> {
  const balance = await userBalance(opts.familyId, opts.userId)
  // Float-sum tolerance so an exact-balance redemption isn't refused.
  if (opts.amount > balance + 1e-6) return { ok: false, reason: 'insufficient-balance' }

  let note = opts.note
  if (opts.wishlistItemId) {
    const item = await prisma.wishlistItem.findFirst({
      where: { id: opts.wishlistItemId, familyId: opts.familyId },
    })
    if (!item) return { ok: false, reason: 'item-not-found' }
    note = note ?? item.title
    await prisma.wishlistItem.update({
      where: { id: item.id },
      data: { isPurchased: true, purchasedById: opts.userId, purchasedAt: new Date() },
    })
  }

  await prisma.pocketMoneyEntry.create({
    data: {
      familyId: opts.familyId,
      userId: opts.userId,
      amount: -Math.abs(opts.amount),
      type: 'redemption',
      note,
      wishlistItemId: opts.wishlistItemId,
      createdById: opts.createdById,
    },
  })
  return { ok: true }
}
