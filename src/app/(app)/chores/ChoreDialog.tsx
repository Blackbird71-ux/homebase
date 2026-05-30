'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { parseDaysOfWeek } from '@/lib/chore-helpers'

const textareaClass =
  'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

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
  note: string | null
  frequency: string
  dayOfWeek: number | null
  daysOfWeek: string | null
  dayOfMonth: number | null
  rotationInterval: number
  currentAssigneeId: string | null
  currentAssignee: { id: string; name: string } | null
  isActive: boolean
  startDate: string | null
  endDate: string | null
  nextDueDate: string | null
  triggerOnComplete: boolean
  autoRotateOnComplete: boolean
  allowEarlyStart: boolean
  emailReminder: boolean
  emailReminderDays: number
  completions: ChoreCompletion[]
  _count: { completions: number }
  createdAt: string
  updatedAt: string
  isOverdue: boolean
}

interface ChoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chore: Chore | null
  members: Member[]
  onSaved: (chore: Chore) => void
}

const DAY_OPTIONS = [
  { value: '0', label: 'Sunday', short: 'Sun' },
  { value: '1', label: 'Monday', short: 'Mon' },
  { value: '2', label: 'Tuesday', short: 'Tue' },
  { value: '3', label: 'Wednesday', short: 'Wed' },
  { value: '4', label: 'Thursday', short: 'Thu' },
  { value: '5', label: 'Friday', short: 'Fri' },
  { value: '6', label: 'Saturday', short: 'Sat' },
]

function toDateInputValue(date: string | null): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export function ChoreDialog({ open, onOpenChange, chore, members, onSaved }: ChoreDialogProps) {
  const [title, setTitle] = useState(chore?.title ?? '')
  const [description, setDescription] = useState(chore?.description ?? '')
  const [note, setNote] = useState(chore?.note ?? '')
  const [frequency, setFrequency] = useState(chore?.frequency ?? 'weekly')
  // Multi-day weekly: the set of weekdays the chore runs on (0=Sun … 6=Sat).
  // Seed from the daysOfWeek JSON column, falling back to the legacy single dayOfWeek.
  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    const multi = parseDaysOfWeek(chore?.daysOfWeek ?? null)
    if (multi.length > 0) return multi
    return chore?.dayOfWeek != null ? [chore.dayOfWeek] : []
  })
  const [dayOfMonth, setDayOfMonth] = useState(chore?.dayOfMonth?.toString() ?? '')
  const [rotationInterval, setRotationInterval] = useState(chore?.rotationInterval?.toString() ?? '1')
  const [currentAssigneeId, setCurrentAssigneeId] = useState(chore?.currentAssigneeId ?? '')
  const [startDate, setStartDate] = useState(toDateInputValue(chore?.startDate ?? null))
  const [endDate, setEndDate] = useState(toDateInputValue(chore?.endDate ?? null))
  const [triggerOnComplete, setTriggerOnComplete] = useState(chore?.triggerOnComplete ?? false)
  const [autoRotateOnComplete, setAutoRotateOnComplete] = useState(chore?.autoRotateOnComplete ?? false)
  const [allowEarlyStart, setAllowEarlyStart] = useState(chore?.allowEarlyStart ?? false)
  const [emailReminder, setEmailReminder] = useState(chore?.emailReminder ?? false)
  const [emailReminderDays, setEmailReminderDays] = useState(chore?.emailReminderDays?.toString() ?? '1')
  const [saving, setSaving] = useState(false)

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    )
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        note: note.trim() || null,
        frequency,
        // dayOfWeek mirrors the first selected day for backward compatibility;
        // daysOfWeek carries the full set. Both only apply to weekly chores.
        dayOfWeek: frequency === 'weekly' && selectedDays.length > 0 ? selectedDays[0] : null,
        daysOfWeek: frequency === 'weekly' ? selectedDays : [],
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
        rotationInterval: parseInt(rotationInterval) || 1,
        currentAssigneeId: currentAssigneeId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        triggerOnComplete,
        autoRotateOnComplete,
        allowEarlyStart,
        emailReminder,
        emailReminderDays: parseInt(emailReminderDays) || 1,
      }

      // For monthly-based chores, auto-set dayOfMonth from start date if not explicitly set
      if ((frequency === 'monthly' || frequency === 'bimonthly' || frequency === 'quarterly' || frequency === 'halfyearly' || frequency === 'yearly') && !dayOfMonth && startDate) {
        body.dayOfMonth = new Date(startDate).getDate()
      }

      // For weekly chores with no day selected, default to the start date's weekday
      if (frequency === 'weekly' && selectedDays.length === 0 && startDate) {
        const startDay = new Date(startDate).getDay()
        body.dayOfWeek = startDay
        body.daysOfWeek = [startDay]
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[720px] flex flex-col overflow-hidden p-0 gap-0" showCloseButton={true}>
        <DrawerHeader className="px-6 pt-5 pb-4 shrink-0 border-b border-border">
          <DrawerTitle>{chore ? 'Edit Chore' : 'Add Chore'}</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            {/* ── Left column: schedule ── */}
            <div className="space-y-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="chore-note">Notes</Label>
              <textarea
                id="chore-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add any notes or instructions for this chore..."
                className={textareaClass}
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
                    <SelectItem value="one-off">One-off</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bimonthly">Bi-monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="halfyearly">Half-yearly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {frequency !== 'one-off' && (
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
              )}
            </div>
            {frequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label>Days of week</Label>
                <div className="flex gap-1">
                  {DAY_OPTIONS.map((d) => {
                    const dayNum = parseInt(d.value)
                    const active = selectedDays.includes(dayNum)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleDay(dayNum)}
                        className={`flex-1 h-9 rounded-md border text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-background text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {d.short}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedDays.length > 1
                    ? 'Rolls to the next selected day each time it’s completed.'
                    : 'Pick one or more days. Leave all unselected for any day.'}
                </p>
              </div>
            )}
            {(frequency === 'monthly' || frequency === 'bimonthly' || frequency === 'quarterly' || frequency === 'halfyearly' || frequency === 'yearly') && (
              <div className="space-y-1.5">
                <Label htmlFor="chore-day-month">Day of month</Label>
                <Input
                  id="chore-day-month"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  placeholder="1-31 (auto from start date)"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="chore-start-date">{frequency === 'one-off' ? 'Due date' : 'Start date'}</Label>
                <Input
                  id="chore-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              {frequency !== 'one-off' && (
              <div className="space-y-1.5">
                <Label htmlFor="chore-end-date">End date (optional)</Label>
                <Input
                  id="chore-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              )}
            </div>
            </div>{/* end left col */}

            <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="chore-assignee">Assign to</Label>
              <Select value={currentAssigneeId} onValueChange={(v) => setCurrentAssigneeId(v ?? '')}>
                <SelectTrigger id="chore-assignee">
                  <SelectValue placeholder="Unassigned">
                    {currentAssigneeId
                      ? members.find((m) => m.id === currentAssigneeId)?.name ?? currentAssigneeId
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-2 border-t border-border/50">
              {frequency !== 'one-off' && (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="chore-trigger">Next occurrence starts after completion</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, next due date is based on the schedule (e.g. every Monday)
                  </p>
                </div>
                <Switch
                  id="chore-trigger"
                  checked={triggerOnComplete}
                  onCheckedChange={setTriggerOnComplete}
                />
              </div>
              )}
              {frequency !== 'one-off' && (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="chore-auto-rotate">Auto-rotate assignee on completion</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically assign to the next family member when completed
                  </p>
                </div>
                <Switch
                  id="chore-auto-rotate"
                  checked={autoRotateOnComplete}
                  onCheckedChange={setAutoRotateOnComplete}
                />
              </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="chore-early-start">Allow early completion</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow marking done and creating the next occurrence before the current one is due
                  </p>
                </div>
                <Switch
                  id="chore-early-start"
                  checked={allowEarlyStart}
                  onCheckedChange={setAllowEarlyStart}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="chore-email-reminder">Email reminder</Label>
                  <p className="text-xs text-muted-foreground">
                    Send an email to the assignee before the due date
                  </p>
                </div>
                <Switch
                  id="chore-email-reminder"
                  checked={emailReminder}
                  onCheckedChange={setEmailReminder}
                />
              </div>
              {emailReminder && (
                <div className="space-y-1.5">
                  <Label htmlFor="chore-reminder-days">Remind how many days before due?</Label>
                  <Input
                    id="chore-reminder-days"
                    type="number"
                    min={1}
                    max={30}
                    value={emailReminderDays}
                    onChange={(e) => setEmailReminderDays(e.target.value)}
                    className="w-24"
                  />
                </div>
              )}
            </div>{/* end switches */}
            </div>{/* end right col */}
          </div>{/* end grid */}
        </div>{/* end scroll body */}
        <div className="px-6 pb-5 pt-4 border-t border-border shrink-0 flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : chore ? 'Update' : 'Create'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}