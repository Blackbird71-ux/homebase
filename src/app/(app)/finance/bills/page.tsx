'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2, Receipt, RefreshCw, Layers, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, addMonths, addWeeks, addDays } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Member { id: string; name: string; email: string }
interface Location { id: string; name: string }
export interface Bill {
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
  paid: boolean
  paidDate: string | null
  invoiceReceived: boolean
  invoiceReceivedDate: string | null
  billType: string
  recurrenceInterval: string | null
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [dateRange, setDateRange] = useState<'14' | '30' | 'quarter'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('bills-dateRange')
      if (saved === '14' || saved === '30' || saved === 'quarter') return saved
    }
    return '30'
  })
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('bills-selectedCatIds')
        if (saved) return JSON.parse(saved) as string[]
      } catch {}
    }
    return []
  })
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [form, setForm] = useState({
    name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
    dayOfMonth: '', monthOfYear: '', nextDueDate: new Date().toISOString().split('T')[0],
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '',
    billType: 'recurring', recurrenceInterval: '',
    invoiceReceived: false, invoiceReceivedDate: '',
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
    } finally { setLoading(false) }
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

  function setDateRangePersisted(r: '14' | '30' | 'quarter') {
    sessionStorage.setItem('bills-dateRange', r)
    setDateRange(r)
  }

  function toggleCat(id: string) {
    setSelectedCatIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      sessionStorage.setItem('bills-selectedCatIds', JSON.stringify(next))
      return next
    })
  }

  function openNew() {
    setEditing(null)
    setForm({
      name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
      dayOfMonth: '', monthOfYear: '', nextDueDate: new Date().toISOString().split('T')[0],
      endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
      notes: '', memberId: '', locationId: '',
      billType: 'recurring', recurrenceInterval: '',
      invoiceReceived: false, invoiceReceivedDate: '',
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
      billType: b.billType ?? 'recurring', recurrenceInterval: b.recurrenceInterval ?? '',
      invoiceReceived: b.invoiceReceived ?? false,
      invoiceReceivedDate: b.invoiceReceivedDate ? new Date(b.invoiceReceivedDate).toISOString().split('T')[0] : '',
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
      billType: form.billType || 'recurring',
      recurrenceInterval: form.recurrenceInterval || null,
      invoiceReceived: form.invoiceReceived,
      invoiceReceivedDate: form.invoiceReceived && form.invoiceReceivedDate ? form.invoiceReceivedDate : null,
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

  async function handleMarkPaid(bill: Bill) {
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, paid: true }),
    })
    if (res.ok) { toast.success('Bill marked as paid'); load() }
    else toast.error('Failed to mark as paid')
  }

  async function handleToggleInvoice(bill: Bill) {
    const newVal = !bill.invoiceReceived
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Invoice marked received' : 'Invoice unmarked'); load() }
    else toast.error('Failed to update invoice status')
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

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
  }

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const now = new Date()
  const rangeEnd = dateRange === '14' ? addDays(now, 14) : dateRange === '30' ? addDays(now, 30) : addMonths(now, 3)

  const activeBills = bills.filter(b => b.isActive && !b.paid)
  const overdue = activeBills.filter(b => b.billType !== 'one-off' && isPast(new Date(b.nextDueDate)))
  const overdueOneOff = activeBills.filter(b => b.billType === 'one-off' && isPast(new Date(b.nextDueDate)))
  const upcoming = activeBills.filter(b => !isPast(new Date(b.nextDueDate)) && new Date(b.nextDueDate) <= rangeEnd)
  const visibleBills = [...overdue, ...upcoming]

  const colCats = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal = visibleBills.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleBills.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading bills…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills & Recurring</h1>
        <div className="flex items-center gap-3">
          <Link href="/finance/paid-bills" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Paid Bills
          </Link>
          <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add Bill
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(['14', '30', 'quarter'] as const).map(r => (
            <button key={r} onClick={() => setDateRangePersisted(r)}
              className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
                dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {r === '14' ? '14 Days' : r === '30' ? '30 Days' : 'Quarter'}
            </button>
          ))}
        </div>

        {rootCategories.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowCatPicker(p => !p)}
              className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCatIds.length > 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              <Settings2 className="h-3.5 w-3.5" />
              {selectedCatIds.length > 0 ? `${selectedCatIds.length} categor${selectedCatIds.length === 1 ? 'y' : 'ies'} shown` : 'Show category columns'}
            </button>
            {showCatPicker && (
              <div className="absolute left-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover shadow-md p-3 space-y-1.5 min-w-[180px]">
                <p className="text-xs text-muted-foreground font-medium mb-2">Show as columns:</p>
                {rootCategories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedCatIds.includes(c.id)} onChange={() => toggleCat(c.id)}
                      className="rounded border-input" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overdue banner - recurring */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-red-500 font-medium mb-2">
            <Bell className="h-4 w-4" /> {overdue.length} overdue recurring bill{overdue.length !== 1 ? 's' : ''}
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

      {/* Overdue one-off bills */}
      {overdueOneOff.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 text-orange-500 font-medium mb-2">
            <Layers className="h-4 w-4" /> {overdueOneOff.length} overdue one-off bill{overdueOneOff.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdueOneOff.map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{b.name}</span>
                <span className="text-xs text-muted-foreground">Due {format(new Date(b.nextDueDate), 'd MMM yyyy')}</span>
                <span className="font-medium">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Bill' : 'New Recurring Bill'}</h3>
          {/* Bill Type */}
          <div className="flex gap-4 pb-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="billType" value="recurring" checked={form.billType === 'recurring'}
                onChange={() => setForm(p => ({ ...p, billType: 'recurring' }))}
                className="accent-primary" />
              <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring Bill
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="billType" value="one-off" checked={form.billType === 'one-off'}
                onChange={() => setForm(p => ({ ...p, billType: 'one-off' }))}
                className="accent-primary" />
              <Layers className="h-3.5 w-3.5 text-orange-500" /> One-Off Bill
            </label>
          </div>

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
            {form.billType === 'recurring' && (
            <div>
              <label className="text-xs text-muted-foreground">Frequency *</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="monthly">Monthly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            )}
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
                <option value="1">January</option><option value="2">February</option>
                <option value="3">March</option><option value="4">April</option>
                <option value="5">May</option><option value="6">June</option>
                <option value="7">July</option><option value="8">August</option>
                <option value="9">September</option><option value="10">October</option>
                <option value="11">November</option><option value="12">December</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{form.billType === 'one-off' ? 'Due Date *' : 'Next Due Date *'}</label>
              <input type="date" value={form.nextDueDate}
                onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            {form.billType === 'recurring' && (
            <div>
              <label className="text-xs text-muted-foreground">End Date (optional)</label>
              <input type="date" value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            )}
            {form.billType === 'recurring' && (
            <div>
              <label className="text-xs text-muted-foreground">Custom Interval (optional)</label>
              <input value={form.recurrenceInterval}
                placeholder="e.g. 2 weeks, 3 months"
                onChange={e => setForm(p => ({ ...p, recurrenceInterval: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            )}
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
          <div className="flex flex-wrap gap-6 pt-2">
            {form.billType === 'recurring' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.autoPay} onChange={e => setForm(p => ({ ...p, autoPay: e.target.checked }))} className="rounded border-input" />
                Auto-pay
              </label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.emailReminder} onChange={e => setForm(p => ({ ...p, emailReminder: e.target.checked }))} className="rounded border-input" />
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
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.invoiceReceived} onChange={e => setForm(p => ({ ...p, invoiceReceived: e.target.checked }))} className="rounded border-input" />
              <Receipt className="h-3.5 w-3.5 text-green-500" /> Invoice received
            </label>
            {form.invoiceReceived && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Invoice date</label>
                <input type="date" value={form.invoiceReceivedDate}
                  onChange={e => setForm(p => ({ ...p, invoiceReceivedDate: e.target.value }))}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea value={form.notes} rows={2} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Bill list */}
      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills yet.</p>
      ) : (
        <div className="space-y-2">
          {/* Column headers when categories selected */}
          {colCats.length > 0 && (
            <div className="flex items-center gap-3 px-3 pb-1">
              <div className="w-9 shrink-0" />
              <div className="flex-1" />
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-medium text-muted-foreground w-24 text-right shrink-0">{c.name}</span>
              ))}
              <span className="text-xs font-medium text-muted-foreground w-24 text-right shrink-0">Total</span>
              <div className="w-16 shrink-0" />
            </div>
          )}

          {overdue.map(b => (
            <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue
              colCats={colCats} billAmountForCat={billAmountForCat}
              onEdit={openEdit} onDelete={handleDelete} onMarkPaid={handleMarkPaid} onToggleInvoice={handleToggleInvoice} formatCurrency={formatCurrency} />
          ))}
          {upcoming.map(b => (
            <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue={false}
              colCats={colCats} billAmountForCat={billAmountForCat}
              onEdit={openEdit} onDelete={handleDelete} onMarkPaid={handleMarkPaid} onToggleInvoice={handleToggleInvoice} formatCurrency={formatCurrency} />
          ))}

          {/* Totals row */}
          {visibleBills.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1">
              <div className="w-9 shrink-0" />
              <div className="flex-1 text-xs font-semibold text-muted-foreground">
                {visibleBills.length} bill{visibleBills.length !== 1 ? 's' : ''}
                {overdue.length > 0 && <span className="text-red-500 ml-1">({overdue.length} overdue)</span>}
              </div>
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-semibold w-24 text-right shrink-0">
                  {catTotals[c.id] > 0 ? formatCurrency(catTotals[c.id]) : <span className="text-muted-foreground">—</span>}
                </span>
              ))}
              <span className="text-sm font-bold w-24 text-right shrink-0">{formatCurrency(grandTotal)}</span>
              <div className="w-16 shrink-0" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BillRow({ bill, nextDue, isOverdue, colCats, billAmountForCat, onEdit, onDelete, onMarkPaid, onToggleInvoice, formatCurrency }: {
  bill: Bill; nextDue: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  billAmountForCat: (bill: Bill, catId: string) => number
  onEdit: (b: Bill) => void; onDelete: (id: string) => void
  onMarkPaid: (b: Bill) => void; onToggleInvoice: (b: Bill) => void
  formatCurrency: (n: number) => string
}) {
  const isOneOff = bill.billType === 'one-off'
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3',
      isOverdue ? 'border-red-500/30 bg-red-500/5' : 'border-border hover:bg-accent/50')}>
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0',
        isOverdue ? 'bg-red-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
        {isOneOff
          ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-orange-500')} />
          : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-muted-foreground')} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{bill.name}</span>
          {!bill.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
          {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
          {bill.invoiceReceived && (
            <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
              <Receipt className="h-2.5 w-2.5" /> INVOICE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
          {bill.account && <span>{bill.account.name}</span>}
          {bill.member && <span className="text-primary">{bill.member.name}</span>}
          {bill.location && <span>{bill.location.name}</span>}
          <span>Due {format(nextDue, 'd MMM yyyy')}</span>
          {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
        </div>
      </div>
      {colCats.map(c => {
        const amt = billAmountForCat(bill, c.id)
        return (
          <span key={c.id} className="text-sm w-24 text-right shrink-0 text-muted-foreground">
            {amt > 0 ? formatCurrency(amt) : '—'}
          </span>
        )
      })}
      <p className="text-sm font-semibold shrink-0 w-24 text-right">{formatCurrency(bill.amount)}</p>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => onToggleInvoice(bill)} title={bill.invoiceReceived ? 'Remove invoice' : 'Mark invoice received'}
          className={cn('p-1 hover:bg-accent rounded', bill.invoiceReceived ? 'text-green-500' : 'text-muted-foreground')}>
          <Receipt className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onMarkPaid(bill)} title="Mark as paid"
          className="p-1 hover:bg-accent rounded text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onEdit(bill)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => onDelete(bill.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
