import type { CalendarEvent } from '@/types'

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

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(event) }}
      className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '33', color }}
    >
      {(event.isRecurring || isRecurringInstance) && (
        <span className="inline-block mr-1" title="Repeating event">🔄</span>
      )}
      {event.title}
    </button>
  )
}
