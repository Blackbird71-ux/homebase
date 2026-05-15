'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

interface Template {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  slots: Array<{
    id: string
    dayOffset: number
    mealType: string
    recipeId: string | null
    note: string | null
    recipe: { id: string; title: string } | null
  }>
}

interface ApplyTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStart: string // YYYY-MM-DD
  onApplied: () => void
}

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  weekStart,
  onApplied,
}: ApplyTemplateDialogProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLoading(true)
      setSelectedId(null)
      fetch('/api/meal-plan/templates')
        .then((r) => r.json())
        .then((data: Template[]) => setTemplates(data))
        .catch(() => toast.error('Failed to load templates'))
        .finally(() => setLoading(false))
    }
  }, [open])

  async function handleApply() {
    if (!selectedId) {
      toast.error('Please select a template')
      return
    }

    setApplying(true)
    try {
      const res = await fetch(`/api/meal-plan/templates/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`Applied template (${data.applied} meals)`)
        onApplied()
        onOpenChange(false)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to apply template')
      }
    } catch {
      toast.error('Network error applying template')
    } finally {
      setApplying(false)
    }
  }

  async function handleDelete(templateId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this template?')) return

    setDeleting(templateId)
    try {
      const res = await fetch(`/api/meal-plan/templates/${templateId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId))
        if (selectedId === templateId) setSelectedId(null)
        toast.success('Template deleted')
      } else {
        toast.error('Failed to delete template')
      }
    } catch {
      toast.error('Network error deleting template')
    } finally {
      setDeleting(null)
    }
  }

  function getDayLabel(offset: number): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[offset]
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Template</DialogTitle>
          <DialogDescription>
            Select a saved template to apply to the current week. Existing meals will be overwritten.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No saved templates yet. Save a week as a template first.
            </p>
          ) : (
            templates.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedId(template.id)}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                  selectedId === template.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {template.slots.length} meal{template.slots.length !== 1 ? 's' : ''} • 
                    {template.slots.map((s) => ` ${getDayLabel(s.dayOffset)}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {template.slots.slice(0, 5).map((slot) => (
                      <span key={slot.id} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                        {getDayLabel(slot.dayOffset)} {slot.mealType}
                        {slot.recipe ? `: ${slot.recipe.title}` : ''}
                      </span>
                    ))}
                    {template.slots.length > 5 && (
                      <span className="text-xs text-muted-foreground">
                        +{template.slots.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => handleDelete(template.id, e)}
                  disabled={deleting === template.id}
                  className="shrink-0 ml-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete template ${template.name}`}
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                </Button>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applying || !selectedId || templates.length === 0}>
            {applying ? 'Applying...' : 'Apply Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
