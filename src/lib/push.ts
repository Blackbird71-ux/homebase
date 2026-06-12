// Server-side web push sender (server-only — imports prisma).
// Subscriptions are registered by the client via /api/push-subscriptions;
// this is the dispatch side, used by the daily briefing cron.

import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

export interface PushPayload {
  title: string
  body: string
  url?: string
}

let vapidConfigured: boolean | null = null

function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys not configured — push sending disabled')
    vapidConfigured = false
    return false
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@localhost', publicKey, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Send a push notification to all of a user's enabled subscriptions.
 * Dead subscriptions (endpoint gone — 404/410) are deleted so they
 * don't accumulate. Returns the number of pushes delivered.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapid()) return 0

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, enabled: true },
  })

  let sent = 0
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      } else {
        console.error(`[push] Failed to send to subscription ${sub.id}:`, err)
      }
    }
  }
  return sent
}
