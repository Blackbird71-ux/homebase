# Homebase — Journal Entries Page
## Complete Implementation Specification for AI Agent

> **File to create:** `src/app/(app)/finance/journals/page.tsx`
> **Stack:** Next.js App Router · `'use client'` · Tailwind + shadcn/ui · `sonner` toasts
> **Pattern:** Match bills/page.tsx and income/page.tsx exactly — same Dialog imports,
>   same error patterns, same `cn()` usage, same toast calls, same form state approach.
> **Do NOT create any API routes** — those are built separately. This spec covers the
>   page component only. The page calls `/api/finance/journals` and `/api/finance/categories`.

---

## 0. Pre-flight — read these files before writing a single line

```bash
# Read the exact Dialog component API
cat src/components/ui/dialog.tsx

# Read the exact pattern for a list page with a form dialog
cat "src/app/(app)/finance/bills/page.tsx" | head -200

# Read how categories are fetched and sorted for dropdowns
cat src/lib/finance-categories.ts

# Confirm the journals API route exists
ls src/app/api/finance/journals/
```

The agent must match the coding patterns in `bills/page.tsx` exactly:
- Import order (lucide-react icons, then sonner, then date-fns, then cn, then components)
- State variable naming
- `async function load()` + `useEffect(() => { load() }, [])`
- `async function loadRefs()` for reference data (categories, entities)
- `openNew()` / `openEdit()` / `closeForm()` functions
- `validate()` returns `Record<string, string>`, errors shown inline + summary banner
- `handleSave()` calls validate first, then fetch, then toast, then load()
- Dialog uses `showCloseButton={true}` prop
- DialogFooter uses Cancel + primary action buttons

---

## 1. Imports

```typescript
'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, BookOpen, Send, RotateCcw,
  CheckCircle2, Clock, AlertTriangle, Eye, ChevronDown, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
```

---

## 2. TypeScript interfaces

```typescript
// ── Reference data ───────────────────────────────────────────────────────────

interface GLAccount {
  id: string
  name: string
  type: string        // asset | liability | equity | income | expense | transfer
  glCode: string | null
  parentId: string | null
  isSystem: boolean
}

interface Entity {
  id: string
  name: string
  color: string | null
  isDefault: boolean
}

// ── Journal data ─────────────────────────────────────────────────────────────

interface JournalLine {
  id: string
  glAccountId: string
  glAccount: { id: string; name: string; type: string; glCode: string | null } | null
  side: 'debit' | 'credit'
  amount: number
  description: string | null
  memberId: string | null
}

interface JournalEntry {
  id: string
  date: string                    // ISO string
  reference: string | null        // e.g. "JE-0012"
  description: string
  type: string                    // manual | opening_balance | reversal | adjustment
  isPosted: boolean
  isReversed: boolean
  reversalOfId: string | null
  lines: JournalLine[]
  entity: { id: string; name: string; color: string | null } | null
  entityId: string | null
  createdAt: string
}

// ── Form state ───────────────────────────────────────────────────────────────

// Each line in the new/edit form
interface FormLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: string    // kept as string for input handling; parsed on save
  description: string
}

interface JournalForm {
  date: string
  description: string
  type: string
  entityId: string
  lines: FormLine[]
}

// Reversal dialog state
interface ReversalState {
  entry: JournalEntry
  date: string
  description: string
}
```

---

## 3. Constants

```typescript
// Type labels shown to the user
const TYPE_LABELS: Record<string, string> = {
  manual:          'Manual',
  opening_balance: 'Opening Balance',
  adjustment:      'Adjustment',
  reversal:        'Reversal',
  auto_transaction: 'Auto (Transaction)',
}

// The type options available when creating a manual entry
const MANUAL_TYPES = [
  { value: 'manual',     label: 'Manual journal entry' },
  { value: 'adjustment', label: 'Adjustment / correction' },
]

// Normal balance side by account type — used to colour-code dropdowns
function normalSide(type: string): 'debit' | 'credit' {
  return (type === 'asset' || type === 'expense') ? 'debit' : 'credit'
}

// Format currency for display
function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
```

---

## 4. Empty form factory

```typescript
function emptyForm(): JournalForm {
  return {
    date:        new Date().toISOString().split('T')[0],
    description: '',
    type:        'manual',
    entityId:    '',
    lines: [
      // Always start with one debit line and one credit line
      { glAccountId: '', side: 'debit',  amount: '', description: '' },
      { glAccountId: '', side: 'credit', amount: '', description: '' },
    ],
  }
}
```

---

## 5. Page component — state

```typescript
export default function JournalsPage() {

  // ── Data state ───────────────────────────────────────────────────────────
  const [entries, setEntries]       = useState<JournalEntry[]>([])
  const [glAccounts, setGLAccounts] = useState<GLAccount[]>([])
  const [entities, setEntities]     = useState<Entity[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const limit = 50

  // ── Loading state ────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [posting, setPosting]       = useState<string | null>(null)  // entry id being posted

  // ── Filter state ─────────────────────────────────────────────────────────
  // 'all' | 'draft' | 'posted'
  const [filterTab, setFilterTab]   = useState<'all' | 'draft' | 'posted'>('all')

  // ── Form dialog state ────────────────────────────────────────────────────
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<JournalEntry | null>(null)
  const [form, setForm]             = useState<JournalForm>(emptyForm())
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // ── Expanded row state (click row to expand lines) ───────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Reversal dialog state ────────────────────────────────────────────────
  const [reversal, setReversal]     = useState<ReversalState | null>(null)
  const [reversalSaving, setReversalSaving] = useState(false)
```

---

## 6. Data loading functions

```typescript
  // Load journal entries from the API
  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  page.toString(),
        limit: limit.toString(),
      })
      if (filterTab === 'draft')  params.set('isPosted', 'false')
      if (filterTab === 'posted') params.set('isPosted', 'true')

      const res = await fetch(`/api/finance/journals?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }

  // Load reference data: GL accounts (FinanceCategory) and entities
  async function loadRefs() {
    const [cRes, eRes] = await Promise.all([
      fetch('/api/finance/categories'),
      fetch('/api/finance/entities'),
    ])
    if (cRes.ok) {
      const cats: GLAccount[] = await cRes.json()
      // Only include account types relevant to journals
      // (exclude transfer — those don't appear in the GL)
      setGLAccounts(cats.filter(c => c.type !== 'transfer'))
    }
    if (eRes.ok) setEntities(await eRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { load() }, [page, filterTab])  // eslint-disable-line react-hooks/exhaustive-deps
```

---

## 7. Form open/close helpers

```typescript
  function openNew() {
    setEditing(null)
    setErrors({})
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(entry: JournalEntry) {
    // Posted entries cannot be edited
    if (entry.isPosted) {
      toast.info('Posted entries cannot be edited. Create a reversal to correct them.')
      return
    }
    setEditing(entry)
    setErrors({})
    setForm({
      date:        entry.date.split('T')[0],
      description: entry.description,
      type:        entry.type,
      entityId:    entry.entityId ?? '',
      lines:       entry.lines.map(l => ({
        glAccountId: l.glAccountId,
        side:        l.side,
        amount:      l.amount.toFixed(2),
        description: l.description ?? '',
      })),
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setErrors({})
  }
```

---

## 8. Form line helpers

```typescript
  // Add a new blank line to the form
  function addLine() {
    setForm(p => ({
      ...p,
      lines: [
        ...p.lines,
        { glAccountId: '', side: 'debit', amount: '', description: '' },
      ],
    }))
  }

  // Remove a line by index (minimum 2 lines enforced)
  function removeLine(index: number) {
    if (form.lines.length <= 2) {
      toast.error('A journal entry requires at least 2 lines.')
      return
    }
    setForm(p => ({
      ...p,
      lines: p.lines.filter((_, i) => i !== index),
    }))
  }

  // Update a specific field on a specific line
  function updateLine(index: number, field: keyof FormLine, value: string) {
    setForm(p => ({
      ...p,
      lines: p.lines.map((l, i) =>
        i === index ? { ...l, [field]: value } : l
      ),
    }))
    // Clear the per-line error when the user changes the line
    if (errors[`line_${index}_account`] || errors[`line_${index}_amount`]) {
      setErrors(p => {
        const next = { ...p }
        delete next[`line_${index}_account`]
        delete next[`line_${index}_amount`]
        return next
      })
    }
  }

  // Computed totals from form lines — used in the balance indicator
  function getLineTotals(): { debitTotal: number; creditTotal: number; difference: number } {
    let debitTotal  = 0
    let creditTotal = 0
    for (const line of form.lines) {
      const amt = parseFloat(line.amount) || 0
      if (line.side === 'debit')  debitTotal  += amt
      else                        creditTotal += amt
    }
    return {
      debitTotal:  Math.round(debitTotal  * 100) / 100,
      creditTotal: Math.round(creditTotal * 100) / 100,
      difference:  Math.round(Math.abs(debitTotal - creditTotal) * 100) / 100,
    }
  }
```

---

## 9. Validation

```typescript
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}

    if (!form.date)              errs.date        = 'Date is required'
    if (!form.description.trim()) errs.description = 'Description is required'
    if (form.lines.length < 2)  errs.lines       = 'At least 2 lines are required'

    // Validate each line
    for (let i = 0; i < form.lines.length; i++) {
      const line = form.lines[i]
      if (!line.glAccountId) {
        errs[`line_${i}_account`] = 'Select a GL account'
      }
      const amt = parseFloat(line.amount)
      if (!line.amount || isNaN(amt) || amt <= 0) {
        errs[`line_${i}_amount`] = 'Enter amount > 0'
      }
    }

    // Debits must equal credits
    const { difference } = getLineTotals()
    if (difference > 0.005) {
      errs.balance = `Debits must equal credits. Difference: ${fmt(difference)}`
    }

    return errs
  }
```

---

## 10. Save handler

```typescript
  async function handleSave(postImmediately: boolean) {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        date:             form.date,
        description:      form.description,
        type:             form.type,
        entityId:         form.entityId || null,
        postImmediately,
        lines: form.lines.map(l => ({
          glAccountId: l.glAccountId,
          side:        l.side,
          amount:      parseFloat(l.amount),
          description: l.description || null,
        })),
      }

      const res = await fetch('/api/finance/journals', {
        method:  editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save journal entry')
        return
      }

      toast.success(
        postImmediately
          ? 'Journal entry saved and posted'
          : editing
          ? 'Draft updated'
          : 'Draft saved'
      )
      closeForm()
      load()
    } finally {
      setSaving(false)
    }
  }
```

---

## 11. Post a draft

```typescript
  async function handlePost(entry: JournalEntry) {
    if (entry.isPosted) return
    setPosting(entry.id)
    try {
      const res = await fetch('/api/finance/journals', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: entry.id, action: 'post' }),
      })
      if (res.ok) {
        toast.success(`${entry.reference ?? 'Entry'} posted to the ledger`)
        load()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to post entry')
      }
    } finally {
      setPosting(null)
    }
  }
```

---

## 12. Delete a draft

```typescript
  async function handleDelete(entry: JournalEntry) {
    if (entry.isPosted) {
      toast.error('Posted entries cannot be deleted. Create a reversal instead.')
      return
    }
    if (!confirm(`Delete draft ${entry.reference ?? 'entry'}: "${entry.description}"?`)) return

    const res = await fetch(`/api/finance/journals?id=${entry.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Draft deleted')
      load()
    } else {
      toast.error('Failed to delete')
    }
  }
```

---

## 13. Open and submit reversal dialog

```typescript
  function openReversal(entry: JournalEntry) {
    setReversal({
      entry,
      date:        new Date().toISOString().split('T')[0],
      description: `Reversal of ${entry.reference ?? entry.id}: ${entry.description}`,
    })
  }

  async function submitReversal() {
    if (!reversal) return
    setReversalSaving(true)
    try {
      const res = await fetch('/api/finance/journals', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:                 reversal.entry.id,
          action:             'reverse',
          reversalDate:       reversal.date,
          reversalDescription: reversal.description,
        }),
      })
      if (res.ok) {
        toast.success('Reversal entry created and posted')
        setReversal(null)
        load()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to create reversal')
      }
    } finally {
      setReversalSaving(false)
    }
  }
```

---

## 14. GL account selector helper

```typescript
  // Build the sorted list for the GL account dropdown
  // Groups: Assets, Liabilities, Equity, Income, Expenses
  // Within each group: parent accounts first, then children indented
  function glAccountOptions(): GLAccount[] {
    const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
    const result: GLAccount[] = []
    for (const type of typeOrder) {
      const roots    = glAccounts.filter(a => a.type === type && !a.parentId)
                                 .sort((a, b) => a.name.localeCompare(b.name))
      const children = glAccounts.filter(a => a.type === type && a.parentId)
                                 .sort((a, b) => a.name.localeCompare(b.name))
      for (const root of roots) {
        result.push(root)
        result.push(...children.filter(c => c.parentId === root.id))
      }
    }
    return result
  }

  // Display name for the GL account dropdown option
  function glAccountLabel(acct: GLAccount): string {
    const code   = acct.glCode ? `[${acct.glCode}] ` : ''
    const indent = acct.parentId ? '— ' : ''
    return `${indent}${code}${acct.name} (${acct.type})`
  }

  // Find a GL account by id
  function findAccount(id: string): GLAccount | undefined {
    return glAccounts.find(a => a.id === id)
  }
```

---

## 15. Early return for loading

```typescript
  if (loading && entries.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">Loading journal entries…</div>
  }
```

---

## 16. Main JSX — page structure

The return statement renders these sections in order:

```
1. Page header (title + New Entry button)
2. Filter tabs (All / Draft / Posted)
3. Summary strip (3 stat cards)
4. New/Edit Entry dialog
5. Reversal dialog
6. Entry list (or empty state)
7. Pagination
```

### 16.1 Page header

```tsx
  return (
    <div className="space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Journal Entries</h1>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> New Entry
        </button>
      </div>
```

### 16.2 Filter tabs

```tsx
      {/* ── Filter tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
        {(['all', 'draft', 'posted'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setFilterTab(tab); setPage(1) }}
            className={cn(
              'px-3 py-1 text-xs rounded-md font-medium transition-colors capitalize',
              filterTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'all' ? 'All' : tab === 'draft' ? 'Draft' : 'Posted'}
          </button>
        ))}
      </div>
```

### 16.3 Summary strip

```tsx
      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Total entries</p>
          <p className="text-xl font-bold">{total}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-muted-foreground mb-1">Drafts (not posted)</p>
          <p className="text-xl font-bold text-amber-600">
            {entries.filter(e => !e.isPosted).length}
          </p>
        </div>
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <p className="text-xs text-muted-foreground mb-1">Posted this page</p>
          <p className="text-xl font-bold text-green-600">
            {entries.filter(e => e.isPosted).length}
          </p>
        </div>
      </div>
```

---

## 17. New/Edit Entry dialog — full JSX

This is the most complex part. Build it exactly as shown.

```tsx
      {/* ── New / Edit dialog ────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Journal Entry' : 'New Journal Entry'}</DialogTitle>
          </DialogHeader>

          {/* ── Error summary banner ──────────────────────────────────── */}
          {Object.keys(errors).length > 0 && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-1">
              <p className="font-medium mb-1">Please fix the following:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {Object.values(errors).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Header fields ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Date */}
            <div>
              <label className="text-xs text-muted-foreground">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => {
                  setForm(p => ({ ...p, date: e.target.value }))
                  if (errors.date) setErrors(p => ({ ...p, date: '' }))
                }}
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-1.5 text-sm',
                  errors.date ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                )}
                disabled={saving}
              />
              {errors.date && <p className="text-xs text-red-500 mt-0.5">{errors.date}</p>}
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                disabled={saving}
              >
                {MANUAL_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Description — full width */}
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Description *</label>
              <input
                value={form.description}
                onChange={e => {
                  setForm(p => ({ ...p, description: e.target.value }))
                  if (errors.description) setErrors(p => ({ ...p, description: '' }))
                }}
                placeholder="e.g. Depreciation — Office Equipment FY2025-26"
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-1.5 text-sm',
                  errors.description ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                )}
                disabled={saving}
              />
              {errors.description && (
                <p className="text-xs text-red-500 mt-0.5">{errors.description}</p>
              )}
            </div>

            {/* Entity */}
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Entity (optional)</label>
              <select
                value={form.entityId}
                onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                disabled={saving}
              >
                <option value="">No entity / household</option>
                {entities.map(en => (
                  <option key={en.id} value={en.id}>
                    {en.name}{en.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Journal lines section ─────────────────────────────────── */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Journal Lines
              </p>
              <p className="text-xs text-muted-foreground">
                Debits must equal credits
              </p>
            </div>

            {/* Column headers */}
            <div className="grid gap-2 mb-1 px-1"
              style={{ gridTemplateColumns: '1fr 90px 110px 28px' }}>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                GL Account
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-center">
                Side
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">
                Amount ($)
              </span>
              <span />
            </div>

            {/* Line rows */}
            <div className="space-y-2">
              {form.lines.map((line, i) => {
                const acct = findAccount(line.glAccountId)
                const hasAccountError = !!errors[`line_${i}_account`]
                const hasAmountError  = !!errors[`line_${i}_amount`]
                return (
                  <div key={i} className="grid gap-2 items-start"
                    style={{ gridTemplateColumns: '1fr 90px 110px 28px' }}>

                    {/* GL Account selector */}
                    <div>
                      <select
                        value={line.glAccountId}
                        onChange={e => updateLine(i, 'glAccountId', e.target.value)}
                        className={cn(
                          'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
                          hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                        )}
                        disabled={saving}
                      >
                        <option value="">Select account…</option>
                        {/* Group by account type with optgroup */}
                        {['asset', 'liability', 'equity', 'income', 'expense'].map(type => {
                          const groupAccounts = glAccountOptions().filter(a => a.type === type)
                          if (groupAccounts.length === 0) return null
                          return (
                            <optgroup
                              key={type}
                              label={type.charAt(0).toUpperCase() + type.slice(1)}
                            >
                              {groupAccounts.map(a => (
                                <option key={a.id} value={a.id}>
                                  {glAccountLabel(a)}
                                </option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                      {/* Show hint for normal balance direction */}
                      {acct && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 pl-0.5">
                          Normal: {normalSide(acct.type)} balance ({acct.type})
                        </p>
                      )}
                    </div>

                    {/* Debit / Credit toggle */}
                    <div className="flex rounded-md border border-input overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateLine(i, 'side', 'debit')}
                        disabled={saving}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium transition-colors',
                          line.side === 'debit'
                            ? 'bg-green-600 text-white'
                            : 'bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        DR
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLine(i, 'side', 'credit')}
                        disabled={saving}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium transition-colors',
                          line.side === 'credit'
                            ? 'bg-red-600 text-white'
                            : 'bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        CR
                      </button>
                    </div>

                    {/* Amount input */}
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={e => updateLine(i, 'amount', e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          'w-full rounded-md border bg-background px-2 py-1.5 text-sm text-right',
                          hasAmountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                        )}
                        disabled={saving}
                      />
                    </div>

                    {/* Remove line button */}
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={saving || form.lines.length <= 2}
                      title="Remove line"
                      className="p-1 hover:bg-accent rounded text-red-500 disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                  </div>
                )
              })}
            </div>

            {/* Add line button */}
            <button
              type="button"
              onClick={addLine}
              disabled={saving}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          {/* ── Balance indicator bar ──────────────────────────────────── */}
          {(() => {
            const { debitTotal, creditTotal, difference } = getLineTotals()
            const balanced = difference < 0.005
            return (
              <div className={cn(
                'rounded-md px-4 py-2.5 flex items-center justify-between text-sm',
                balanced
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30',
              )}>
                <div>
                  <p className="text-xs text-muted-foreground">Total Debits</p>
                  <p className={cn('font-semibold tabular-nums', balanced ? 'text-green-600 dark:text-green-400' : 'text-foreground')}>
                    {fmt(debitTotal)}
                  </p>
                </div>
                <div className="text-center">
                  {balanced ? (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Balanced
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      Difference: {fmt(difference)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total Credits</p>
                  <p className={cn('font-semibold tabular-nums', balanced ? 'text-green-600 dark:text-green-400' : 'text-foreground')}>
                    {fmt(creditTotal)}
                  </p>
                </div>
              </div>
            )
          })()}

          {/* ── Dialog footer ─────────────────────────────────────────── */}
          <DialogFooter>
            <button
              onClick={closeForm}
              disabled={saving}
              className="rounded-md border border-border px-4 py-1.5 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            {/* Save as Draft — always enabled (balance not required for draft) */}
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              {saving ? 'Saving…' : editing ? 'Update Draft' : 'Save as Draft'}
            </button>
            {/* Save and Post — disabled until balanced */}
            {(() => {
              const { difference } = getLineTotals()
              const balanced = difference < 0.005
              return (
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !balanced}
                  title={!balanced ? 'Entry must be balanced before posting' : undefined}
                  className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {saving ? 'Posting…' : 'Save & Post'}
                </button>
              )
            })()}
          </DialogFooter>

        </DialogContent>
      </Dialog>
```

---

## 18. Reversal dialog — full JSX

```tsx
      {/* ── Reversal dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!reversal} onOpenChange={open => { if (!open) setReversal(null) }}>
        <DialogContent className="sm:max-w-md" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-red-500" />
              Reverse Journal Entry
            </DialogTitle>
          </DialogHeader>

          {reversal && (
            <>
              {/* Entry being reversed */}
              <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Reversing:</p>
                <p className="font-medium">{reversal.entry.reference} — {reversal.entry.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(reversal.entry.date), 'd MMM yyyy')}
                </p>
              </div>

              {/* Warning */}
              <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  A new posted entry will be created with all debits and credits swapped.
                  The original entry will be marked as reversed. This cannot be undone.
                </span>
              </div>

              {/* Reversal fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Reversal date</label>
                  <input
                    type="date"
                    value={reversal.date}
                    onChange={e => setReversal(p => p ? { ...p, date: e.target.value } : p)}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    disabled={reversalSaving}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reversal description</label>
                  <input
                    value={reversal.description}
                    onChange={e => setReversal(p => p ? { ...p, description: e.target.value } : p)}
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    disabled={reversalSaving}
                  />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <button
              onClick={() => setReversal(null)}
              disabled={reversalSaving}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={submitReversal}
              disabled={reversalSaving}
              className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {reversalSaving ? 'Creating…' : 'Create Reversal'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

---

## 19. Entry list — empty state

```tsx
      {/* ── Entry list ────────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {filterTab === 'draft'  ? 'No draft entries' :
             filterTab === 'posted' ? 'No posted entries' :
             'No journal entries yet'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {filterTab === 'all'
              ? 'Create entries for depreciation, adjustments, accruals, and opening balances.'
              : 'Change the filter above to see other entries.'}
          </p>
          {filterTab === 'all' && (
            <button
              onClick={openNew}
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-4 w-4" /> Create first entry
            </button>
          )}
        </div>
      ) : (
```

---

## 20. Entry list — row rendering

Each row has:
- Left: coloured icon (green = posted, amber = draft, red = reversal)
- Middle: reference + description + entity chip + type badge + line preview
- Right: status badge + action buttons
- Clicking the row body toggles expanded lines view

```tsx
        <div className="space-y-2">
          {entries.map(entry => {
            const isExpanded  = expandedId === entry.id
            const isDraft     = !entry.isPosted
            const isReversal  = entry.type === 'reversal'
            const isReversed  = entry.isReversed

            // Icon and colour based on state
            const iconBg    = isDraft    ? 'bg-amber-500/10'
                            : isReversal ? 'bg-red-500/10'
                            : isReversed ? 'bg-muted'
                            :              'bg-green-500/10'
            const iconColor = isDraft    ? 'text-amber-600'
                            : isReversal ? 'text-red-600'
                            : isReversed ? 'text-muted-foreground'
                            :              'text-green-600'

            return (
              <div
                key={entry.id}
                className={cn(
                  'rounded-lg border transition-colors',
                  isDraft    ? 'border-amber-500/30 border-dashed' :
                  isReversed ? 'border-border opacity-60'          :
                               'border-border',
                  isExpanded && 'ring-1 ring-primary/20',
                )}
              >
                {/* ── Main row ───────────────────────────────────────── */}
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-lg select-none"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  {/* Icon */}
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    iconBg,
                  )}>
                    {isDraft    ? <Clock      className={cn('h-4 w-4', iconColor)} /> :
                     isReversal ? <RotateCcw  className={cn('h-4 w-4', iconColor)} /> :
                                  <BookOpen   className={cn('h-4 w-4', iconColor)} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Reference + date */}
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {entry.reference && (
                        <span className="text-xs font-mono font-medium text-muted-foreground">
                          {entry.reference}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.date), 'd MMM yyyy')}
                      </span>
                      {/* Entity chip */}
                      {entry.entity && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                          style={{ backgroundColor: entry.entity.color ?? '#6B7280' }}
                        >
                          {entry.entity.name}
                        </span>
                      )}
                      {/* Type badge */}
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {TYPE_LABELS[entry.type] ?? entry.type}
                      </span>
                      {/* Reversed badge */}
                      {isReversed && (
                        <span className="text-[10px] bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded border border-red-500/20">
                          REVERSED
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-sm font-medium truncate">{entry.description}</p>

                    {/* Compact line preview — shown when NOT expanded */}
                    {!isExpanded && entry.lines.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.lines
                          .slice(0, 3)
                          .map(l => `${l.side === 'debit' ? 'DR' : 'CR'} ${l.glAccount?.name ?? '—'} ${fmt(l.amount)}`)
                          .join(' · ')}
                        {entry.lines.length > 3 && ` · +${entry.lines.length - 3} more`}
                      </p>
                    )}
                  </div>

                  {/* Right side: status badge + actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Status badge */}
                    {isDraft ? (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> Draft
                      </span>
                    ) : (
                      <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Posted
                      </span>
                    )}

                    {/* Action buttons */}
                    <div
                      className="flex items-center gap-0.5"
                      onClick={e => e.stopPropagation()}  // prevent row toggle when clicking actions
                    >
                      {isDraft && (
                        <>
                          {/* Post button */}
                          <button
                            onClick={() => handlePost(entry)}
                            disabled={posting === entry.id}
                            title="Post to ledger"
                            className="inline-flex items-center gap-1 rounded-md bg-green-600 text-white text-xs px-2 py-1 disabled:opacity-50 hover:bg-green-700 transition-colors"
                          >
                            <Send className="h-3 w-3" />
                            {posting === entry.id ? 'Posting…' : 'Post'}
                          </button>
                          {/* Edit draft */}
                          <button
                            onClick={() => openEdit(entry)}
                            title="Edit draft"
                            className="p-1 hover:bg-accent rounded"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {/* Delete draft */}
                          <button
                            onClick={() => handleDelete(entry)}
                            title="Delete draft"
                            className="p-1 hover:bg-accent rounded text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {!isDraft && !isReversed && !isReversal && (
                        /* Reverse posted entry */
                        <button
                          onClick={() => openReversal(entry)}
                          title="Reverse this entry"
                          className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Expand toggle */}
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-0.5" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground ml-0.5" />}
                    </div>
                  </div>

                </div>

                {/* ── Expanded lines view ─────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-lg">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Journal Lines
                    </p>
                    {/* Column headers */}
                    <div className="grid gap-2 mb-1"
                      style={{ gridTemplateColumns: '1fr 60px 120px' }}>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Account</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Side</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-right">Amount</span>
                    </div>
                    {entry.lines.map((line, li) => (
                      <div
                        key={line.id}
                        className="grid gap-2 py-1 border-t border-border/50 first:border-t-0"
                        style={{ gridTemplateColumns: '1fr 60px 120px' }}
                      >
                        <div>
                          <p className="text-sm">
                            {line.glAccount?.name ?? line.glAccountId}
                          </p>
                          {line.glAccount?.glCode && (
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {line.glAccount.glCode}
                            </p>
                          )}
                          {line.description && (
                            <p className="text-xs text-muted-foreground italic">{line.description}</p>
                          )}
                        </div>
                        <div className="text-center">
                          <span className={cn(
                            'text-xs font-bold px-2 py-0.5 rounded',
                            line.side === 'debit'
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400',
                          )}>
                            {line.side === 'debit' ? 'DR' : 'CR'}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'text-sm font-semibold tabular-nums',
                            line.side === 'debit'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}>
                            {fmt(line.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* Line totals */}
                    {(() => {
                      const dr = entry.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
                      const cr = entry.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
                      return (
                        <div className="grid gap-2 mt-2 pt-2 border-t border-border"
                          style={{ gridTemplateColumns: '1fr 60px 120px' }}>
                          <span className="text-xs font-semibold text-muted-foreground">Totals</span>
                          <span />
                          <div className="text-right space-y-0.5">
                            <p className="text-xs text-green-600 tabular-nums">DR {fmt(dr)}</p>
                            <p className="text-xs text-red-600 tabular-nums">CR {fmt(cr)}</p>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

              </div>
            )
          })}
        </div>
      )}
```

---

## 21. Pagination

```tsx
      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {Math.ceil(total / limit) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

    </div>  {/* end space-y-4 */}
  )
}  {/* end JournalsPage */}
```

---

## 22. Behaviour specification — agent must implement exactly

### Form line DR/CR toggle
The DR / CR buttons are a segmented control (two buttons side by side with a shared border).
- DR active: `bg-green-600 text-white`
- CR active: `bg-red-600 text-white`
- Inactive: `bg-background text-muted-foreground`
- Clicking toggles `line.side` between `'debit'` and `'credit'`

### Balance indicator — live update
The balance bar re-computes on every keystroke in any amount field.
`getLineTotals()` is called directly in the JSX render, not stored in state.
This means it is always current with no stale state issues.

### Save & Post button disabled state
The "Save & Post" button must be `disabled` when `difference >= 0.005`.
It must also show `title="Entry must be balanced before posting"` when disabled.
The "Save as Draft" button is NEVER disabled (drafts can be unbalanced).

### Expand/collapse on row click
Clicking anywhere on the main row div (excluding the action buttons area) toggles `expandedId`.
The action buttons area uses `onClick={e => e.stopPropagation()}` to prevent the row toggle.

### Reversal — only for posted, non-reversed, non-reversal entries
The Reverse button only appears when: `!isDraft && !isReversed && !isReversal`
Reversal entries themselves cannot be reversed again.
Reversed entries show the REVERSED badge but no action buttons.

### GL account dropdown — optgroup grouping
Use native HTML `<optgroup label="Asset">` etc. to group the accounts by type.
The order of groups is: Asset → Liability → Equity → Income → Expense.
Within each group, parents appear before children (use `glAccountOptions()` which sorts this).
Children are displayed with an em-dash prefix: `— Child Account Name`.

### Error clearing on input change
When a field with an error is changed, immediately clear that field's error from `errors` state.
This gives the user instant feedback that they've addressed the problem.

### Draft dashed border
Draft entries use `border-dashed` instead of `border-solid` so they visually stand out
as "not yet real" — they haven't hit the ledger yet.

### Posting spinner
While a specific entry is being posted, show "Posting…" text on that entry's Post button
and disable it. Use `posting === entry.id` to track which specific entry is in-flight.
Other entries' Post buttons remain enabled.

---

## 23. Navigation — add to layout

**File:** `src/app/(app)/finance/layout.tsx`

Find the `tabs` array and add this entry after the `'Annual P&L'` tab:

```typescript
{ href: '/finance/journals', label: 'Journals', exact: false },
```

The route path is `/finance/journals` and it points to the page created above.

---

## 24. Verification checklist

Run through every item before marking complete.

### TypeScript
- [ ] `npx tsc --noEmit` passes with no new errors introduced by this file
- [ ] All interfaces are used — no unused type definitions
- [ ] `GLAccount`, `JournalEntry`, `JournalLine`, `FormLine`, `JournalForm`, `ReversalState` all defined

### Page loads
- [ ] `/finance/journals` route loads without error
- [ ] "Journal Entries" heading with BookOpen icon visible
- [ ] "New Entry" button in top right
- [ ] Filter tabs All / Draft / Posted visible and clickable
- [ ] Summary strip shows 3 stat cards

### Empty state
- [ ] When no entries: empty state with BookOpen icon and message shows
- [ ] Empty state text changes based on active filter tab
- [ ] "Create first entry" button in empty state opens the form

### New entry form
- [ ] Dialog opens when "New Entry" clicked
- [ ] Date defaults to today
- [ ] Two lines pre-populated (one DR, one CR)
- [ ] GL account dropdowns show all categories grouped by type (Asset / Liability etc.)
- [ ] GL account dropdown shows `[glCode] Name (type)` format
- [ ] Optgroups separate account types visually
- [ ] DR/CR toggle works — green for DR, red for CR
- [ ] Amount input is right-aligned, numeric
- [ ] "Normal balance" hint appears below account selector when an account is selected
- [ ] "Add line" button adds a third row (and beyond)
- [ ] Remove button is disabled when only 2 lines remain
- [ ] Remove button removes the correct line by index

### Balance indicator
- [ ] Shows debit total, credit total, difference — all live
- [ ] Green "Balanced" state when totals match within $0.005
- [ ] Red "Difference: $X.XX" state when unbalanced
- [ ] "Save & Post" button is disabled when unbalanced
- [ ] "Save & Post" button is enabled when balanced
- [ ] "Save as Draft" is always enabled

### Validation
- [ ] Submitting with empty description shows error
- [ ] Submitting with no date shows error
- [ ] Submitting with empty GL account on any line shows per-line error
- [ ] Submitting with zero/blank amount on any line shows per-line error
- [ ] Submitting when unbalanced shows balance error
- [ ] Error summary banner shows all errors at once
- [ ] Changing a field clears that field's error immediately

### Saving
- [ ] "Save as Draft" creates a draft (isPosted=false) — toast "Draft saved"
- [ ] "Save & Post" creates a posted entry — toast "Journal entry saved and posted"
- [ ] After saving, form closes and list reloads
- [ ] Editing a draft pre-populates all fields including all lines
- [ ] "Update Draft" button text shown when editing
- [ ] Posted entry: clicking row shows toast "Posted entries cannot be edited"

### Entry list rows
- [ ] Posted entries: solid border, green BookOpen icon, green "Posted" badge
- [ ] Draft entries: dashed amber border, amber Clock icon, amber "Draft" badge
- [ ] Reversal entries: solid border, red RotateCcw icon, red "Reversal" badge
- [ ] Reversed entries: 60% opacity, "REVERSED" badge, no action buttons
- [ ] Entity chip shows entity colour
- [ ] Type badge shows human-readable type
- [ ] Compact line preview shows DR/CR account names and amounts
- [ ] Clicking row expands/collapses line detail

### Expanded lines view
- [ ] Shows all lines with Account / Side / Amount columns
- [ ] DR lines show green DR badge, CR lines show red CR badge
- [ ] Line description shown if present
- [ ] GL code shown in small monospace text if present
- [ ] Totals row at bottom shows DR total and CR total
- [ ] Collapsing hides the expanded lines

### Draft actions
- [ ] "Post" button visible on draft rows
- [ ] Clicking Post shows "Posting…" and disables that button
- [ ] After posting, entry moves to Posted state — toast confirmation
- [ ] Edit button on draft opens the form pre-filled
- [ ] Delete button on draft shows confirm dialog, then deletes — toast confirmation
- [ ] Clicking edit/delete/post does NOT toggle the row expand (stopPropagation works)

### Posted entry actions
- [ ] Reverse button (RotateCcw icon) visible on posted, non-reversed entries
- [ ] No Reverse button on reversal entries or already-reversed entries
- [ ] Clicking Reverse opens reversal dialog

### Reversal dialog
- [ ] Shows the entry being reversed (reference + description + date)
- [ ] Warning message visible
- [ ] Reversal date defaults to today
- [ ] Reversal description pre-populated with "Reversal of JE-XXXX: [original description]"
- [ ] Both fields editable
- [ ] "Create Reversal" button submits — toast confirmation
- [ ] After reversal: original entry shows REVERSED badge, new reversal entry appears in list
- [ ] Cancel closes dialog without action

### Filter tabs
- [ ] "Draft" tab shows only isPosted=false entries
- [ ] "Posted" tab shows only isPosted=true entries
- [ ] "All" tab shows all entries
- [ ] Changing tab resets page to 1

### Pagination
- [ ] Previous/Next buttons appear when total > 50
- [ ] Previous disabled on page 1
- [ ] Next disabled on last page
- [ ] Page number displayed correctly

### Navigation
- [ ] "Journals" tab appears in finance nav after "Annual P&L"
- [ ] Tab highlights correctly when on the journals page
