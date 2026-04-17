import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getAccessToken, createGoogleEvent } from '@/lib/google-calendar'

export async function POST(_req: Request) {
  const user = await requireSession()

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

  let synced = 0
  let skipped = 0

  let token: string
  try {
    token = await getAccessToken(dbUser.googleRefreshToken)
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate with Google' }, { status: 502 })
  }

  for (const event of events) {
    // Skip personal events from other users
    if (event.isPersonal && event.createdBy !== user.id) {
      skipped++
      continue
    }

    // Skip already-synced events
    if (syncedEventIds.has(event.id)) {
      skipped++
      continue
    }

    try {
      const googleEventId = await createGoogleEvent(token, {
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end,
        isAllDay: event.isAllDay,
      })
      await prisma.googleCalendarSync.create({
        data: { eventId: event.id, userId: user.id, googleEventId },
      })
      synced++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ synced, skipped })
}
