import { prisma } from '@/lib/prisma'
import { getAccessToken, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/google-calendar'

export async function pushEventToGoogle(
  eventId: string,
  operation: 'create' | 'update'
): Promise<void> {
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) return

    const allConnected = await prisma.user.findMany({
      where: { familyId: event.familyId, googleConnected: true },
      select: { id: true, googleRefreshToken: true },
    })

    // Personal events only push to creator; family events push to all connected users
    const targetUsers = event.isPersonal
      ? allConnected.filter((u) => u.id === event.createdBy)
      : allConnected

    const existingSyncs = await prisma.googleCalendarSync.findMany({
      where: { eventId },
    })
    const syncMap = new Map(existingSyncs.map((s) => [s.userId, s]))

    const eventInput = {
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
    }

    const targetUserIds = new Set(targetUsers.map((u) => u.id))

    // Remove from users who should no longer have the event (visibility changed)
    for (const sync of existingSyncs) {
      if (!targetUserIds.has(sync.userId)) {
        const user = allConnected.find((u) => u.id === sync.userId)
        if (user?.googleRefreshToken) {
          try {
            const token = await getAccessToken(user.googleRefreshToken)
            await deleteGoogleEvent(token, sync.googleEventId)
          } catch {
            // swallow
          }
        }
        try {
          await prisma.googleCalendarSync.delete({ where: { id: sync.id } })
        } catch {
          // swallow DB error
        }
      }
    }

    // Create or update for target users
    for (const user of targetUsers) {
      if (!user.googleRefreshToken) continue
      try {
        const token = await getAccessToken(user.googleRefreshToken)
        const existing = syncMap.get(user.id)
        if (existing) {
          await updateGoogleEvent(token, existing.googleEventId, eventInput)
        } else {
          const googleEventId = await createGoogleEvent(token, eventInput)
          await prisma.googleCalendarSync.create({
            data: { eventId, userId: user.id, googleEventId },
          })
        }
      } catch {
        // swallow individual user errors
      }
    }
  } catch (err) {
    console.error('[google-sync] pushEventToGoogle failed:', err)
  }
}
