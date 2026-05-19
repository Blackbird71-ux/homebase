'use client'

import {
  Pencil, Trash2, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusChip } from '@/components/shared/StatusChip'
import { FREQ_LABELS } from '@/lib/finance-template-helpers'
import type { TemplateRow } from '@/lib/finance-template-helpers'

export function TemplateListRow({
  template, onEdit, onToggle, onDelete,
}: {
  template: TemplateRow
  onEdit: (t: TemplateRow) => void
  onToggle: (t: TemplateRow) => void
  onDelete: (t: TemplateRow) => void
}) {
  const nextDate = template.nextOccurrenceDate
    ? new Date(template.nextOccurrenceDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div
      className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer', !template.enabled && 'opacity-50')}
      onDoubleClick={() => onEdit(template)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{template.name}</span>
          <StatusChip variant={template.enabled ? 'ok' : 'neutral'} dot>
            {template.enabled ? 'Active' : 'Disabled'}
          </StatusChip>
          {template.createAutomatically && <StatusChip variant="info">AUTO</StatusChip>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {FREQ_LABELS[template.frequency] ?? template.frequency}
          {template.createInAdvanceDays > 0 && ` · ${template.createInAdvanceDays}d advance`}
          {' · '}<span className="text-foreground/70">Next: {nextDate}</span>
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onToggle(template)}
          title={template.enabled ? 'Disable' : 'Enable'}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {template.enabled
            ? <ToggleRight className="h-4 w-4 text-green-600" />
            : <ToggleLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => onEdit(template)}
          title="Edit"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(template)}
          title="Delete"
          className="p-1.5 rounded hover:bg-accent text-red-500 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
