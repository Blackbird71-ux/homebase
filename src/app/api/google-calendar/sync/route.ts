import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getAccessToken, createGoogleEvent } from '@/lib/google-calendar'

export async function POST(_req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { googleConnected: true, googleRefreshToken: true },
  })

  if (!dbUser?.googleConnected || !dbUser.googleRefreshToken) {
    return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
  }

  const now = new Date()
  const twelveMonthsLater = new Date(now)
  twelveMonthsLater.setFullYear(twelveMonthsLater.getFullYear() + 1)

  const events = await prisma.event.findMany({
    where: {
      familyId: user.familyId,
      start: { gte: now, lte: twelveMonthsLater },
    },
  })

  const existingSyncs = await prisma.googleCalendarSync.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  })
  const syncedEventIds = new Set(existingSyncs.map((s) => s.eventId))

  let token: string
  try {
    token = await getAccessToken(dbUser.googleRefreshToken)
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate with Google' }, { status: 502 })
  }

  // Pre-filter the events that actually need pushing to Google: drop other users'
  // personal events and ones already synced. The rest count as skipped.
  const toCreate = events.filter(
    (event) =>
      !(event.isPersonal && event.createdBy !== user.id) &&
      !syncedEventIds.has(event.id)
  )
  let skipped = events.length - toCreate.length

  // Push to Google in bounded-concurrency batches: fully sequential risks a request
  // timeout on large initial syncs, fully parallel risks Google API rate limits.
  const CONCURRENCY = 5
  const created: { eventId: string; userId: string; googleEventId: string }[] = []

  for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
    const batch = toCreate.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (event) => {
        try {
          const googleEventId = await createGoogleEvent(token, {
            title: event.title,
            description: event.description,
            start: event.start,
            end: event.end,
            isAllDay: event.isAllDay,
          })
          return { eventId: event.id, userId: user.id, googleEventId }
        } catch {
          return null
        }
      })
    )
    for (const r of results) {
      if (r) created.push(r)
      else skipped++
    }
  }

  // One batched insert instead of a DB round-trip per event.
  if (created.length > 0) {
    await prisma.googleCalendarSync.createMany({ data: created })
  }

  return NextResponse.json({ synced: created.length, skipped })
}
