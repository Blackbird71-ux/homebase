'use client'

import { useEffect, useRef, useState } from 'react'
import { StickyNote, Users, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StickyNoteData, StickyNoteScope } from '@/types'

const SAVE_DELAY_MS = 800
const MAX_LENGTH = 10_000 // mirrors STICKY_NOTE_MAX_LENGTH (server-only module)

export function StickyNoteCard({
  note,
  scope,
}: {
  note: StickyNoteData
  scope: StickyNoteScope
}) {
  const [content, setContent] = useState(note.content)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(note.content)

  // Adopt fresh server content (e.g. after a dashboard refetch) unless the user has unsaved typing.
  useEffect(() => {
    if (!dirty.current) {
      setContent(note.content)
      latest.current = note.content
    }
  }, [note.content])

  async function save(value: string, keepalive = false) {
    setStatus('saving')
    try {
      const res = await fetch('/api/dashboard/sticky-note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, content: value }),
        keepalive,
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? 'Failed to save note')
      }
      if (latest.current === value) dirty.current = false
      setStatus('saved')
    } catch (err) {
      setStatus('idle')
      toast.error(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  function flush(keepalive = false) {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      if (dirty.current) void save(latest.current, keepalive)
    }
  }

  // Save any pending edit when the card unmounts (hidden, page navigation).
  useEffect(() => () => flush(true), []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(value: string) {
    setContent(value)
    latest.current = value
    dirty.current = true
    setStatus('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void save(value)
    }, SAVE_DELAY_MS)
  }

  return (
    <Card className="h-full flex flex-col bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <StickyNote className="h-4 w-4" />
            {scope === 'shared' ? 'Family Note' : 'My Note'}
          </CardTitle>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : null}
            {scope === 'shared'
              ? <Users className="h-3 w-3" aria-label="Shared with family" />
              : <Lock className="h-3 w-3" aria-label="Just me" />}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex">
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => flush()}
          maxLength={MAX_LENGTH}
          placeholder={scope === 'shared' ? 'Write a note for the family…' : 'Write a note for yourself…'}
          aria-label="Sticky note"
          className="flex-1 min-h-[120px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </CardContent>
    </Card>
  )
}
