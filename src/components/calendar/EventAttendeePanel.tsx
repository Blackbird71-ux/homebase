'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X, HelpCircle, UserPlus } from 'lucide-react'

interface Attendee {
  id: string
  eventId: string
  userId: string
  status: 'going' | 'maybe' | 'declined' | 'invited'
  user: {
    id: string
    name: string
    email: string
  }
}

interface EventAttendeePanelProps {
  eventId: string
  currentUserId: string
}

export function EventAttendeePanel({ eventId, currentUserId }: EventAttendeePanelProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [myStatus, setMyStatus] = useState<string | null>(null)

  useEffect(() => {
    loadAttendees()
  }, [eventId])

  async function loadAttendees() {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/attendees`)
      if (res.ok) {
        const data: Attendee[] = await res.json()
        setAttendees(data)
        const me = data.find((a) => a.userId === currentUserId)
        setMyStatus(me?.status ?? null)
      }
    } catch (err) {
      console.error('Failed to load attendees:', err)
    } finally {
      setLoading(false)
    }
  }

  async function updateMyStatus(status: string) {
    try {
      const res = await fetch(`/api/events/${eventId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setMyStatus(status)
        await loadAttendees()
      }
    } catch (err) {
      console.error('Failed to update RSVP:', err)
    }
  }

  const going = attendees.filter((a) => a.status === 'going')
  const maybe = attendees.filter((a) => a.status === 'maybe')
  const declined = attendees.filter((a) => a.status === 'declined')
  const invited = attendees.filter((a) => a.status === 'invited')

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">RSVP</span>
      </div>

      {/* My RSVP buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={myStatus === 'going' ? 'default' : 'outline'}
          onClick={() => updateMyStatus('going')}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-1" />
          Going
        </Button>
        <Button
          type="button"
          size="sm"
          variant={myStatus === 'maybe' ? 'default' : 'outline'}
          onClick={() => updateMyStatus('maybe')}
          className="flex-1"
        >
          <HelpCircle className="h-4 w-4 mr-1" />
          Maybe
        </Button>
        <Button
          type="button"
          size="sm"
          variant={myStatus === 'declined' ? 'destructive' : 'outline'}
          onClick={() => updateMyStatus('declined')}
          className="flex-1"
        >
          <X className="h-4 w-4 mr-1" />
          No
        </Button>
      </div>

      {/* Attendee list */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : attendees.length > 0 ? (
        <div className="space-y-2 text-sm">
          {going.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Going ({going.length})</p>
              <div className="flex flex-wrap gap-1">
                {going.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs"
                  >
                    <Check className="h-3 w-3" />
                    {a.user.name || a.user.email}
                  </span>
                ))}
              </div>
            </div>
          )}
          {maybe.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Maybe ({maybe.length})</p>
              <div className="flex flex-wrap gap-1">
                {maybe.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs"
                  >
                    <HelpCircle className="h-3 w-3" />
                    {a.user.name || a.user.email}
                  </span>
                ))}
              </div>
            </div>
          )}
          {declined.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Declined ({declined.length})</p>
              <div className="flex flex-wrap gap-1">
                {declined.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
                  >
                    <X className="h-3 w-3" />
                    {a.user.name || a.user.email}
                  </span>
                ))}
              </div>
            </div>
          )}
          {invited.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Invited ({invited.length})</p>
              <div className="flex flex-wrap gap-1">
                {invited.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs"
                  >
                    <UserPlus className="h-3 w-3" />
                    {a.user.name || a.user.email}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No RSVPs yet</p>
      )}
    </div>
  )
}
