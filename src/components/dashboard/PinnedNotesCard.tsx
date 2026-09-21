'use client'

import Link from 'next/link'
import { StickyNote, Folder, ShieldCheck, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInTz } from '@/lib/timezone'
import type { PinnedNoteSummary } from '@/types'

export function PinnedNotesCard({
  notes,
  timezone = 'Australia/Sydney',
}: {
  notes: PinnedNoteSummary[]
  timezone?: string
}) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <StickyNote className="h-4 w-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 min-h-0">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
            <StickyNote className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No pinned notes</p>
            <Link href="/notes" className="text-xs text-primary hover:underline mt-1">
              Pin a note
            </Link>
          </div>
        ) : (
          notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors group"
            >
              <div className="shrink-0 mt-0.5">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Note titles are stored as HTML by the notes editor */}
                  <span
                    className="text-sm font-medium truncate [&_*]:inline [&_*]:!my-0"
                    dangerouslySetInnerHTML={{ __html: note.title }}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatInTz(new Date(note.updatedAt), timezone, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {note.isSecured ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" />
                    <span>PIN required to view</span>
                  </div>
                ) : note.content ? (
                  <div
                    className="text-xs text-muted-foreground line-clamp-2 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_*]:!my-0 [&_ul]:pl-4 [&_ol]:pl-4"
                    dangerouslySetInnerHTML={{ __html: note.content }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground italic">No content</p>
                )}
                {note.category && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Folder className="h-3 w-3" />
                    <span className="truncate">{note.category}</span>
                  </div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
            </Link>
          ))
        )}

        {notes.length > 0 && (
          <Link
            href="/notes"
            className="block text-center text-xs text-primary hover:underline pt-1"
          >
            View all notes
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
