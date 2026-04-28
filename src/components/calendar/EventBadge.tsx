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
}: {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
}) {
  if (event.isBusy) {
    return (
      <div className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground cursor-default select-none">
        Busy
      </div>
    )
  }

  const color = event.color ?? '#6366f1'
  const e = event as unknown as Record<string, unknown>
  const isRecurringInstance = !!(e.isRecurringInstance || e.seriesId)
  const specialIcon = getEventIcon(event)

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(event) }}
      className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '33', color }}
    >
      {specialIcon ? (
        <span className="inline-block mr-1" title={specialIcon.title}>{specialIcon.icon}</span>
      ) : (event.isRecurring || isRecurringInstance) ? (
        <span className="inline-block mr-1" title="Repeating event">🔄</span>
      ) : null}
      {event.title}
    </button>
  )
}
