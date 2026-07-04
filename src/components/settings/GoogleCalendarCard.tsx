'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

interface GoogleCalendarCardProps {
  googleConnected: boolean
  googleEmail: string | null
}

export function GoogleCalendarCard({ googleConnected, googleEmail }: GoogleCalendarCardProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [deleteFromGoogle, setDeleteFromGoogle] = useState(false)

  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      toast.success('Google Calendar connected successfully')
      router.replace('/settings?tab=integrations')
    }
  }, [searchParams, router])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/google-calendar/sync', { method: 'POST' })
      const data = (await res.json().catch(() => null) ?? {}) as { synced?: number; skipped?: number; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Sync failed. Please try again.')
      } else {
        toast.success(`${data.synced} event${data.synced !== 1 ? 's' : ''} pushed to Google Calendar${data.skipped ? ` (${data.skipped} already synced)` : ''}`)
      }
    } catch {
      toast.error('Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFromGoogle }),
      })
      if (res.ok) {
        toast.success('Google Calendar disconnected')
        setShowDisconnectModal(false)
        router.refresh()
      } else {
        toast.error('Failed to disconnect. Please try again.')
      }
    } catch {
      toast.error('Failed to disconnect. Please try again.')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            {googleConnected
              ? 'Events you create in HomeBase are automatically pushed to your Google Calendar.'
              : 'Connect your Google account to automatically sync HomeBase events to your Google Calendar.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleConnected ? (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Connected as {googleEmail}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSync} disabled={syncing} variant="outline">
                  {syncing ? 'Syncing…' : 'Sync unsynced events'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setDeleteFromGoogle(false); setShowDisconnectModal(true) }}
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <a
              href="/api/auth/google/connect"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Connect Google Calendar
            </a>
          )}
        </CardContent>
      </Card>

      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Disconnect Google Calendar</p>
                <p className="text-sm text-muted-foreground mt-1">What would you like to do with your synced events?</p>
              </div>
            </div>
            <div className="space-y-2 pl-8">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="disconnect-mode"
                  checked={!deleteFromGoogle}
                  onChange={() => setDeleteFromGoogle(false)}
                />
                Keep my events in Google Calendar
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="disconnect-mode"
                  checked={deleteFromGoogle}
                  onChange={() => setDeleteFromGoogle(true)}
                />
                Delete synced events from Google Calendar
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowDisconnectModal(false)} disabled={disconnecting}>
                Cancel
              </Button>
              <Button onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
