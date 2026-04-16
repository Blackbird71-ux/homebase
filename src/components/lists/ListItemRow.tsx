'use client'

import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ListItemRowProps {
  id: string
  content: string
  isCompleted: boolean
  dueDate?: string | null
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
}

export function ListItemRow({
  id,
  content,
  isCompleted,
  dueDate,
  onToggle,
  onDelete,
}: ListItemRowProps) {
  const dueDateObj = dueDate ? new Date(dueDate) : null
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isOverdue =
    dueDateObj !== null && !isCompleted && dueDateObj < todayStart

  return (
    <div
      className={`flex items-center gap-3 py-2 px-1 rounded-md group ${
        isCompleted ? 'opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
        aria-label={`Mark "${content}" ${isCompleted ? 'incomplete' : 'complete'}`}
      />
      <span
        className={`flex-1 text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
      >
        {content}
      </span>
      {dueDateObj && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
            isOverdue
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(id)}
        className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Delete item"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
