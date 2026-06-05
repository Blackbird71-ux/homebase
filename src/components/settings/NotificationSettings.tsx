'use client'

import { useState, useEffect, useCallback } from 'react'
import { BellIcon, BellOffIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { formatInTz } from '@/lib/timezone'

interface Subscription {
  id: string
  enabled: boolean
  createdAt: string
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationSettings() {
  const timezone = useFamilyTimezone()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribeLoading, setSubscribeLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default')

  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/push-subscriptions')
      if (res.ok) {
        const data = await res.json()
        setSubscriptions(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      setSupported(true)
      setPermissionState(Notification.permission)
    }
    loadSubscriptions()
  }, [loadSubscriptions])

  async function subscribe() {
    if (!supported) {
      toast.error('Push notifications are not supported in this browser')
      return
    }

    setSubscribeLoading(true)
    try {
      const permission = await Notification.requestPermission()
      setPermissionState(permission)
      if (permission !== 'granted') {
        toast.error('Notification permission denied')
        return
      }

      const registration = await navigator.serviceWorker.ready

      // Get VAPID public key from the server
      const keyRes = await fetch('/api/push-subscriptions/vapid-public-key')
      if (!keyRes.ok) {
        if (keyRes.status === 500) {
          toast.error('Push notifications not configured — contact your admin to set up VAPID keys')
        } else {
          toast.error('Failed to get push configuration from server')
        }
        return
      }
      const { publicKey } = await keyRes.json()

      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })

      const subJSON = pushSubscription.toJSON()

      const res = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys?.p256dh,
          auth: subJSON.keys?.auth,
        }),
      })

      if (!res.ok) throw new Error('Failed to save subscription')
      toast.success('Push notifications enabled!')
      loadSubscriptions()
    } catch (err) {
      console.error('Subscription error:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed to enable push notifications: ${message}`)
    } finally {
      setSubscribeLoading(false)
    }
  }

  async function toggleSubscription(id: string, enabled: boolean) {
    try {
      const res = await fetch('/api/push-subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
      toast.success(enabled ? 'Notifications enabled' : 'Notifications disabled')
    } catch {
      toast.error('Failed to update subscription')
    }
  }

  async function removeSubscription(id: string) {
    try {
      const res = await fetch('/api/push-subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setSubscriptions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Subscription removed')
    } catch {
      toast.error('Failed to remove subscription')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="h-4 w-4" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported in this browser. Try Chrome, Edge, or Firefox.
          </p>
        ) : permissionState === 'denied' ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-500">
              Notification permission was denied. Please enable it in your browser settings.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable notifications</p>
                <p className="text-xs text-muted-foreground">
                  Receive alerts for upcoming events, chores, and reminders.
                </p>
              </div>
              <Button size="sm" onClick={subscribe} disabled={subscribeLoading}>
                {subscribeLoading ? (
                  <>
                    <span className="h-4 w-4 mr-1 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <BellIcon className="h-4 w-4 mr-1" />
                    Subscribe
                  </>
                )}
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading subscriptions...</p>
            ) : subscriptions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Your devices</p>
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {sub.enabled ? (
                        <BellIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <BellOffIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm">
                          {sub.enabled ? 'Active' : 'Paused'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Subscribed {formatInTz(new Date(sub.createdAt), timezone)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleSubscription(sub.id, !sub.enabled)}
                      >
                        {sub.enabled ? 'Pause' : 'Resume'}
                      </Button>
                      <button
                        onClick={() => removeSubscription(sub.id)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors"
                        aria-label="Remove subscription"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active subscriptions. Click "Subscribe" to enable push notifications on this device.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
