import { Lock } from 'lucide-react'
import type { CalendarEvent } from '@/types'

function getEventIcon(event: CalendarEvent): { icon: string; title: string } | null {
  const category = event.category?.toLowerCase() ?? ''
  if (category === 'birthday') return { icon: '🎂', title: 'Birthday' }
  if (category === 'anniversary') return { icon: '💍', title: 'Anniversary' }
  return null
}

export function EventBadge({
  event,
  onClick,
  compact = false,
}: {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
  compact?: boolean
}) {
  if (event.isBusy) {
    return (
      <div className="w-full text-left text-xs px-2 py-0.5 rounded-md font-medium bg-muted/60 text-muted-foreground cursor-default select-none flex items-center gap-1">
        <Lock className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate italic">Private event</span>
      </div>
    )
  }

  const color = event.color ?? '#6366f1'
  const e = event as unknown as Record<string, unknown>
  const isRecurringInstance = !!(e.isRecurringInstance || e.seriesId)
  const specialIcon = getEventIcon(event)

  return (
    <button
      onClick={ev => { ev.stopPropagation(); onClick(event) }}
      className="group w-full text-left text-xs font-medium rounded-md overflow-hidden flex items-stretch transition-all duration-150 hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
      style={{ '--event-color': color } as React.CSSProperties}
    >
      {/* Left color stripe */}
      <span
        className="w-1 shrink-0 rounded-l-md"
        style={{ backgroundColor: color }}
      />
      {/* Content area */}
      <span
        className="flex-1 px-1.5 py-0.5 truncate rounded-r-md flex items-center gap-1"
        style={{ backgroundColor: color + '20', color }}
      >
        {specialIcon ? (
          <span className="shrink-0 text-xs" title={specialIcon.title}>{specialIcon.icon}</span>
        ) : (event.isRecurring || isRecurringInstance) ? (
          <span className="shrink-0 text-[9px]" title="Repeating">↻</span>
        ) : null}
        <span className="truncate">{event.title}</span>
      </span>
    </button>
  )
}
