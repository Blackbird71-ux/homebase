'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface Member {
  id: string
  name: string
}

interface ChoreCompletion {
  id: string
  completedById: string
  completedAt: string
  note: string | null
  completedBy: { id: string; name: string }
}

interface Chore {
  id: string
  title: string
  description: string | null
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  rotationInterval: number
  currentAssigneeId: string | null
  currentAssignee: { id: string; name: string } | null
  isActive: boolean
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
}

interface ChoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chore: Chore | null
  members: Member[]
  onSaved: (chore: Chore) => void
}

const DAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

export function ChoreDialog({ open, onOpenChange, chore, members, onSaved }: ChoreDialogProps) {
  const [title, setTitle] = useState(chore?.title ?? '')
  const [description, setDescription] = useState(chore?.description ?? '')
  const [frequency, setFrequency] = useState(chore?.frequency ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState(chore?.dayOfWeek?.toString() ?? '')
  const [dayOfMonth, setDayOfMonth] = useState(chore?.dayOfMonth?.toString() ?? '')
  const [rotationInterval, setRotationInterval] = useState(chore?.rotationInterval?.toString() ?? '1')
  const [currentAssigneeId, setCurrentAssigneeId] = useState(chore?.currentAssigneeId ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        frequency,
        dayOfWeek: dayOfWeek ? parseInt(dayOfWeek) : null,
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
        rotationInterval: parseInt(rotationInterval) || 1,
        currentAssigneeId: currentAssigneeId || null,
      }

      const url = chore ? `/api/chores/${chore.id}` : '/api/chores'
      const method = chore ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to save chore')
      const saved = await res.json()
      onSaved(saved)
      toast.success(chore ? 'Chore updated' : 'Chore created')
    } catch {
      toast.error('Failed to save chore')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{chore ? 'Edit Chore' : 'Add Chore'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="chore-title">Title</Label>
            <Input
              id="chore-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Take out bins"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chore-desc">Description (optional)</Label>
            <Input
              id="chore-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the task"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chore-freq">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => v && setFrequency(v)}>
                <SelectTrigger id="chore-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chore-rotate">Rotate every</Label>
              <Input
                id="chore-rotate"
                type="number"
                min={1}
                value={rotationInterval}
                onChange={(e) => setRotationInterval(e.target.value)}
              />
            </div>
          </div>
          {frequency === 'weekly' && (
            <div className="space-y-1.5">
              <Label htmlFor="chore-day">Day of week</Label>
              <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v ?? '')}>
                <SelectTrigger id="chore-day">
                  <SelectValue placeholder="Any day" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {frequency === 'monthly' && (
            <div className="space-y-1.5">
              <Label htmlFor="chore-day-month">Day of month</Label>
              <Input
                id="chore-day-month"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1-31"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="chore-assignee">Assign to</Label>
            <Select value={currentAssigneeId} onValueChange={(v) => setCurrentAssigneeId(v ?? '')}>
              <SelectTrigger id="chore-assignee">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : chore ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
