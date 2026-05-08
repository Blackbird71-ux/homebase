'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, addMonths, addWeeks } from 'date-fns'
import { cn } from '@/lib/utils'

interface Member { id: string; name: string; email: string }
interface Location { id: string; name: string }
interface Bill {
  id: string; name: string; amount: number; frequency: string
  dayOfMonth: number | null; monthOfYear: number | null
  nextDueDate: string; endDate: string | null; isActive: boolean
  autoPay: boolean; emailReminder: boolean; reminderDays: number
  notes: string | null
  memberId: string | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  member: Member | null
  location: Location | null
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [form, setForm] = useState({
    name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
    dayOfMonth: '', monthOfYear: '', nextDueDate: new Date().toISOString().split('T')[0],
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '',
  })

  function enrichBills(data: any[]): Bill[] {
    return data.map((b: any) => ({
      ...b,
      member: b.memberId ? (members.find((m: Member) => m.id === b.memberId) ?? null) : null,
    }))
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bills')
      if (res.ok) setBills(enrichBills(await res.json()))
    }
    finally { setLoading(false) }
  }
  async function loadRefs() {
    const [aRes, cRes, mRes, lRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    if (mRes.ok) setMembers(await mRes.json())
    if (lRes.ok) setLocations(await lRes.json())
  }
  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0) load() }, [members])

  function openNew() {
    setEditing(null)
    setForm({
      name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
      dayOfMonth: '', monthOfYear: '', nextDueDate: new Date().toISOString().split('T')[0],
      endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
      notes: '', memberId: '', locationId: '',
    })
    setShowForm(true)
  }
  function openEdit(b: Bill) {
    setEditing(b)
    setForm({
      name: b.name, amount: b.amount, frequency: b.frequency,
      accountId: b.account?.id ?? '', categoryId: b.category?.id ?? '',
      dayOfMonth: b.dayOfMonth?.toString() ?? '',
      monthOfYear: b.monthOfYear?.toString() ?? '',
      nextDueDate: new Date(b.nextDueDate).toISOString().split('T')[0],
      endDate: b.endDate ? new Date(b.endDate).toISOString().split('T')[0] : '',
      autoPay: b.autoPay, emailReminder: b.emailReminder, reminderDays: b.reminderDays,
      notes: b.notes ?? '', memberId: b.memberId ?? '', locationId: b.location?.id ?? '',
    })
    setShowForm(true)
  }

  function getFormPayload() {
    return {
      ...form,
      amount: form.amount || 0,
      accountId: form.accountId || null,
      categoryId: form.categoryId || null,
      dayOfMonth: form.dayOfMonth || null,
      monthOfYear: form.monthOfYear || null,
      endDate: form.endDate || null,
      notes: form.notes || null,
      memberId: form.memberId || null,
      locationId: form.locationId || null,
    }
  }

  async function handleSave() {
    const body = editing ? { id: editing.id, ...getFormPayload() } : getFormPayload()
    const res = await fetch('/api/finance/bills', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Bill updated' : 'Bill created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bill?')) return
    const res = await fetch(`/api/finance/bills?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bill deleted'); load() }
    else toast.error('Failed to delete')
  }

  function getNextDue(bill: Bill): Date {
    const due = new Date(bill.nextDueDate)
    if (isPast(due)) {
      if (bill.frequency === 'monthly') return addMonths(due, 1)
      if (bill.frequency === 'fortnightly') return addWeeks(due, 2)
      if (bill.frequency === 'weekly') return addWeeks(due, 1)
      if (bill.frequency === 'quarterly') return addMonths(due, 3)
      if (bill.frequency === 'yearly') return addMonths(due, 12)
    }
    return due
  }

  function formatCurrency(amount: number) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount) }

  const overdue = bills.filter(b => b.isActive && isPast(new Date(b.nextDueDate)))
  const upcoming = bills.filter(b => b.isActive && !isPast(new Date(b.nextDueDate)))

  if (loading) return <div className="p-4 text-muted-foreground">Loading bills…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills & Recurring</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Bill
        </button>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-red-500 font-medium mb-2">
            <Bell className="h-4 w-4" /> {overdue.length} overdue bill{overdue.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdue.map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{b.name}</span>
                <span className="font-medium">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Bill' : 'New Recurring Bill'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Frequency *</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="monthly">Monthly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="one_off">One Off</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Account</label>
              <select value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Day of Month</label>
              <input type="number" min={1} max={31} value={form.dayOfMonth}
                onChange={e => setForm(p => ({ ...p, dayOfMonth: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Month of Year (for annual)</label>
              <select value={form.monthOfYear} onChange={e => setForm(p => ({ ...p, monthOfYear: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">None</option>
                <option value="1">January</option>
                <option value="2">February</option>
                <option value="3">March</option>
                <option value="4">April</option>
                <option value="5">May</option>
                <option value="6">June</option>
                <option value="7">July</option>
                <option value="8">August</option>
                <option value="9">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Next Due Date *</label>
              <input type="date" value={form.nextDueDate}
                onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End Date (optional)</label>
              <input type="date" value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Assigned To</label>
              <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Shared (household)</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Location</label>
              <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Toggles row */}
          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.autoPay}
                onChange={e => setForm(p => ({ ...p, autoPay: e.target.checked }))}
                className="rounded border-input" />
              Auto-pay
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.emailReminder}
                onChange={e => setForm(p => ({ ...p, emailReminder: e.target.checked }))}
                className="rounded border-input" />
              Email reminder
            </label>
            {form.emailReminder && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Remind</label>
                <input type="number" min={0} max={30} value={form.reminderDays}
                  onChange={e => setForm(p => ({ ...p, reminderDays: parseInt(e.target.value) || 0 }))}
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center" />
                <span className="text-xs text-muted-foreground">days before</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills yet.</p>
      ) : (
        <div className="space-y-2">
          {overdue.map(b => <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue onEdit={openEdit} onDelete={handleDelete} formatCurrency={formatCurrency} />)}
          {upcoming.map(b => <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue={false} onEdit={openEdit} onDelete={handleDelete} formatCurrency={formatCurrency} />)}
        </div>
      )}
    </div>
  )
}

function BillRow({ bill, nextDue, isOverdue, onEdit, onDelete, formatCurrency }: {
  bill: Bill; nextDue: Date; isOverdue: boolean
  onEdit: (b: Bill) => void; onDelete: (id: string) => void; formatCurrency: (n: number) => string
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3',
      isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-border hover:bg-accent/50')}>
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
        isOverdue ? 'bg-red-500/10' : 'bg-muted')}>
        <Bell className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{bill.name}</span>
          {!bill.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
          {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">{bill.frequency}</span>
          {bill.account && <span>{bill.account.name}</span>}
          {bill.member && <span className="text-primary">{bill.member.name}</span>}
          {bill.location && <span>{bill.location.name}</span>}
          <span>Due {format(nextDue, 'd MMM yyyy')}</span>
          {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
        </div>
      </div>
      <p className="text-sm font-semibold">{formatCurrency(bill.amount)}</p>
      <button onClick={() => onEdit(bill)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => onDelete(bill.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}