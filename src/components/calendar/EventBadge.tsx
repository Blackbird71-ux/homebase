import type { CalendarEvent } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
  Medical: '#ef4444',
  School: '#3b82f6',
  Social: '#8b5cf6',
  Work: '#f59e0b',
  Other: '#6b7280',
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

  const color = event.color ?? CATEGORY_COLORS[event.category ?? ''] ?? '#6366f1'

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(event) }}
      className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '33', color }}
    >
      {event.title}
    </button>
  )
}
