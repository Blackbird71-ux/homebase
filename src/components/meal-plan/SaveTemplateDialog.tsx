'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface SaveTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStart: string // YYYY-MM-DD
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  weekStart,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Please enter a template name')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/meal-plan/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), weekStart }),
      })

      if (res.ok) {
        toast.success(`Template "${name.trim()}" saved`)
        setName('')
        onOpenChange(false)
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'Failed to save template')
      }
    } catch {
      toast.error('Network error saving template')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Week as Template</DialogTitle>
          <DialogDescription>
            Save the current week's meal plan as a named template that can be applied to future weeks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Standard Week, Healthy Week"
              autoFocus
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
