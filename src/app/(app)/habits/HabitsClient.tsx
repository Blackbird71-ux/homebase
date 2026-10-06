'use client'

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HabitList } from '@/components/habits/HabitList'
import { HABIT_NAME_MAX, type HabitView } from '@/lib/habit-helpers'

interface HabitForm {
  name: string
  targetPerWeek: number
  isActive: boolean
  emailReminder: boolean
  reminderHour: number
}

const emptyForm: HabitForm = { name: '', targetPerWeek: 7, isActive: true, emailReminder: false, reminderHour: 8 }

const targetLabel = (n: number) => (n === 7 ? 'Every day' : `${n}× per week`)

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`

export function HabitsClient({ initialHabits }: { initialHabits: HabitView[] }) {
  const [habits, setHabits] = useState(initialHabits)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HabitForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  async function reload() {
    const res = await fetch('/api/habits?includeInactive=true')
    if (res.ok) setHabits(await res.json())
  }

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(h: HabitView) {
    setEditingId(h.id)
    setForm({ name: h.name, targetPerWeek: h.targetPerWeek, isActive: h.isActive, emailReminder: h.emailReminder, reminderHour: h.reminderHour })
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(editingId ? `/api/habits/${editingId}` : '/api/habits', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          targetPerWeek: form.targetPerWeek,
          isActive: form.isActive,
          emailReminder: form.emailReminder,
          reminderHour: form.reminderHour,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error ?? 'Could not save habit')
        return
      }
      setOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editingId || !confirm(`Delete "${form.name}" and its history? This cannot be undone.`)) return
    const res = await fetch(`/api/habits/${editingId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Could not delete habit')
      return
    }
    setOpen(false)
    await reload()
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <Button onClick={openNew}>
          <PlusIcon className="h-4 w-4 mr-1" /> New habit
        </Button>
      </div>

      {habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits yet. Add one to start tracking.</p>
      ) : (
        <section className="rounded-xl border border-border bg-card p-4">
          <HabitList habits={habits} onHabitsChange={setHabits} includeInactive onEdit={openEdit} />
        </section>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{editingId ? 'Edit habit' : 'New habit'}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-4 py-4 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="habit-name">Name</Label>
              <Input
                id="habit-name"
                value={form.name}
                maxLength={HABIT_NAME_MAX}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Walk, Take vitamins"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="habit-target">Target</Label>
              <Select value={String(form.targetPerWeek)} onValueChange={(v) => { if (v) setForm({ ...form, targetPerWeek: Number(v) }) }}>
                <SelectTrigger id="habit-target">
                  <SelectValue>{targetLabel(form.targetPerWeek)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[7, 6, 5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>{targetLabel(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Every day builds a daily streak. Fewer than 7 builds a weekly streak: each week you hit the target keeps it going.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="habit-active">Active (untick to pause)</Label>
              <Switch id="habit-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Paused habits are hidden from Today and keep their history.
            </p>
            <div className="flex items-center justify-between">
              <Label htmlFor="habit-email-reminder">Email reminder</Label>
              <Switch id="habit-email-reminder" checked={form.emailReminder} onCheckedChange={(v) => setForm({ ...form, emailReminder: v })} />
            </div>
            {form.emailReminder && (
              <div className="space-y-1.5">
                <Label htmlFor="habit-reminder-hour">Remind me from</Label>
                <Select value={String(form.reminderHour)} onValueChange={(v) => { if (v) setForm({ ...form, reminderHour: Number(v) }) }}>
                  <SelectTrigger id="habit-reminder-hour">
                    <SelectValue>{hourLabel(form.reminderHour)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  One email a day, sent from this hour (family timezone) only if the habit isn&apos;t ticked off yet.
                </p>
              </div>
            )}
          </div>
          <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
            {editingId && (
              <Button variant="outline" className="text-destructive sm:mr-auto" onClick={remove}>Delete</Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
