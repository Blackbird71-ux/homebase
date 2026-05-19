'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Send, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn, todayAU } from '@/lib/utils'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/sheet'
import {
  type GLAccount, type Entity, type JournalEntry, type FormLine,
  MANUAL_TYPES, fmt, normalSide, emptyForm,
} from './journal-types'
import { getLineTotals, validateJournalEntry, sortedGlAccounts, glAccountLabel } from './journal-helpers'

interface Props {
  open: boolean
  editing: JournalEntry | null
  glAccounts: GLAccount[]
  entities: Entity[]
  onClose: () => void
  onSaved: () => void
}

export function JournalEntryForm({ open, editing, glAccounts, entities, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => emptyForm(todayAU()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        date:        editing.date.split('T')[0],
        description: editing.description,
        type:        editing.type,
        entityId:    editing.entityId ?? '',
        lines:       editing.lines.map(l => ({
          glAccountId: l.glAccountId,
          side:        l.side,
          amount:      l.amount.toFixed(2),
          description: l.description ?? '',
        })),
      })
    } else {
      setForm(emptyForm(todayAU()))
    }
    setErrors({})
  }, [open, editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function addLine() {
    setForm(p => ({ ...p, lines: [...p.lines, { glAccountId: '', side: 'debit', amount: '', description: '' }] }))
  }

  function removeLine(index: number) {
    if (form.lines.length <= 2) { toast.error('A journal entry requires at least 2 lines.'); return }
    setForm(p => ({ ...p, lines: p.lines.filter((_, i) => i !== index) }))
  }

  function updateLine(index: number, field: keyof FormLine, value: string) {
    setForm(p => ({ ...p, lines: p.lines.map((l, i) => i === index ? { ...l, [field]: value } : l) }))
    if (errors[`line_${index}_account`] || errors[`line_${index}_amount`]) {
      setErrors(p => {
        const next = { ...p }
        delete next[`line_${index}_account`]
        delete next[`line_${index}_amount`]
        return next
      })
    }
  }

  function findAccount(id: string): GLAccount | undefined {
    return glAccounts.find(a => a.id === id)
  }

  async function handleSave(postImmediately: boolean) {
    const errs = validateJournalEntry(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        date:        form.date,
        description: form.description,
        type:        form.type,
        entityId:    form.entityId || null,
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
      toast.success(postImmediately ? 'Journal entry saved and posted' : editing ? 'Draft updated' : 'Draft saved')
      onClose()
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const { debitTotal, creditTotal, difference } = getLineTotals(form.lines)
  const balanced = difference < 0.005

  return (
    <Drawer open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DrawerContent className="sm:max-w-[720px]" showCloseButton={true}>
        <DrawerHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
          <DrawerTitle>{editing ? 'Edit Journal Entry' : 'New Journal Entry'}</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-1">
            <p className="font-medium mb-1">Please fix the following:</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => { setForm(p => ({ ...p, date: e.target.value })); if (errors.date) setErrors(p => ({ ...p, date: '' })) }}
              className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.date ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
              disabled={saving}
            />
            {errors.date && <p className="text-xs text-red-500 mt-0.5">{errors.date}</p>}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            >
              {MANUAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Description *</label>
            <input
              value={form.description}
              onChange={e => { setForm(p => ({ ...p, description: e.target.value })); if (errors.description) setErrors(p => ({ ...p, description: '' })) }}
              placeholder="e.g. Depreciation — Office Equipment FY2025-26"
              className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.description ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
              disabled={saving}
            />
            {errors.description && <p className="text-xs text-red-500 mt-0.5">{errors.description}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Entity (optional)</label>
            <select
              value={form.entityId}
              onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="">No entity / household</option>
              {entities.map(en => <option key={en.id} value={en.id}>{en.name}{en.isDefault ? ' (default)' : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Journal Lines</p>
            <p className="text-xs text-muted-foreground">Debits must equal credits</p>
          </div>

          {/* Desktop column headers */}
          <div className="hidden sm:grid gap-2 mb-1 px-1" style={{ gridTemplateColumns: '1fr 90px 110px 28px' }}>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">GL Account</span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center">Side</span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Amount ($)</span>
            <span />
          </div>

          <div className="space-y-2">
            {form.lines.map((line, i) => {
              const acct = findAccount(line.glAccountId)
              const hasAccountError = !!errors[`line_${i}_account`]
              const hasAmountError  = !!errors[`line_${i}_amount`]
              return (
                <div key={i}>
                  {/* Desktop: 4-col grid */}
                  <div className="hidden sm:grid gap-2 items-start" style={{ gridTemplateColumns: '1fr 90px 110px 28px' }}>
                    <div>
                      <select value={line.glAccountId} onChange={e => updateLine(i, 'glAccountId', e.target.value)}
                        className={cn('w-full rounded-md border bg-background px-2 py-1.5 text-sm', hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
                        disabled={saving}>
                        <option value="">Select account…</option>
                        {['asset', 'liability', 'equity', 'income', 'expense'].map(type => {
                          const groupAccounts = sortedGlAccounts(glAccounts).filter(a => a.type === type)
                          if (groupAccounts.length === 0) return null
                          return (
                            <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                              {groupAccounts.map(a => <option key={a.id} value={a.id}>{glAccountLabel(a)}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                      {acct && <p className="text-xs text-muted-foreground/70 mt-0.5 pl-0.5">Normal: {normalSide(acct.type)} balance ({acct.type})</p>}
                      {hasAccountError && <p className="text-xs text-red-500 mt-0.5">{errors[`line_${i}_account`]}</p>}
                    </div>
                    <div className="flex rounded-md border border-input overflow-hidden">
                      <button type="button" onClick={() => updateLine(i, 'side', 'debit')} disabled={saving}
                        className={cn('flex-1 py-1.5 text-xs font-medium transition-colors', line.side === 'debit' ? 'bg-green-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground')}>DR</button>
                      <button type="button" onClick={() => updateLine(i, 'side', 'credit')} disabled={saving}
                        className={cn('flex-1 py-1.5 text-xs font-medium transition-colors', line.side === 'credit' ? 'bg-red-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground')}>CR</button>
                    </div>
                    <div>
                      <input type="number" step="0.01" min="0" value={line.amount}
                        onChange={e => updateLine(i, 'amount', e.target.value)} placeholder="0.00"
                        className={cn('w-full rounded-md border bg-background px-2 py-1.5 text-sm text-right', hasAmountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
                        disabled={saving} />
                      {hasAmountError && <p className="text-xs text-red-500 mt-0.5 text-right">{errors[`line_${i}_amount`]}</p>}
                    </div>
                    <button type="button" onClick={() => removeLine(i)} disabled={saving || form.lines.length <= 2}
                      className="p-1 hover:bg-accent rounded text-red-500 disabled:opacity-30 disabled:cursor-not-allowed mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Mobile: stacked card */}
                  <div className="sm:hidden rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                    <select value={line.glAccountId} onChange={e => updateLine(i, 'glAccountId', e.target.value)}
                      className={cn('w-full rounded-md border bg-background px-2 py-2 text-sm', hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
                      disabled={saving}>
                      <option value="">Select account…</option>
                      {['asset', 'liability', 'equity', 'income', 'expense'].map(type => {
                        const groupAccounts = sortedGlAccounts(glAccounts).filter(a => a.type === type)
                        if (groupAccounts.length === 0) return null
                        return (
                          <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                            {groupAccounts.map(a => <option key={a.id} value={a.id}>{glAccountLabel(a)}</option>)}
                          </optgroup>
                        )
                      })}
                    </select>
                    {acct && <p className="text-xs text-muted-foreground/70 -mt-1 pl-0.5">Normal: {normalSide(acct.type)} balance ({acct.type})</p>}
                    {hasAccountError && <p className="text-xs text-red-500">{errors[`line_${i}_account`]}</p>}
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                        <button type="button" onClick={() => updateLine(i, 'side', 'debit')} disabled={saving}
                          className={cn('px-3.5 py-2 text-sm font-semibold transition-colors', line.side === 'debit' ? 'bg-green-600 text-white' : 'bg-background text-muted-foreground')}>DR</button>
                        <button type="button" onClick={() => updateLine(i, 'side', 'credit')} disabled={saving}
                          className={cn('px-3.5 py-2 text-sm font-semibold transition-colors', line.side === 'credit' ? 'bg-red-600 text-white' : 'bg-background text-muted-foreground')}>CR</button>
                      </div>
                      <input type="number" step="0.01" min="0" value={line.amount}
                        onChange={e => updateLine(i, 'amount', e.target.value)} placeholder="0.00"
                        className={cn('flex-1 rounded-md border bg-background px-3 py-2 text-base text-right', hasAmountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
                        disabled={saving} />
                      <button type="button" onClick={() => removeLine(i)} disabled={saving || form.lines.length <= 2}
                        className="p-2 hover:bg-accent rounded text-red-400 disabled:opacity-30 shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {hasAmountError && <p className="text-xs text-red-500 text-right">{errors[`line_${i}_amount`]}</p>}
                  </div>
                </div>
              )
            })}
          </div>

          <button type="button" onClick={addLine} disabled={saving}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
        </div>

        <div className={cn('rounded-md px-4 py-2.5 flex items-center justify-between text-sm', balanced ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30')}>
          <div>
            <p className="text-xs text-muted-foreground">Total Debits</p>
            <p className={cn('font-semibold tabular-nums', balanced ? 'text-green-600 dark:text-green-400' : 'text-foreground')}>{fmt(debitTotal)}</p>
          </div>
          <div className="text-center">
            {balanced ? (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Balanced
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-semibold">
                <AlertTriangle className="h-4 w-4" /> Difference: {fmt(difference)}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Credits</p>
            <p className={cn('font-semibold tabular-nums', balanced ? 'text-green-600 dark:text-green-400' : 'text-foreground')}>{fmt(creditTotal)}</p>
          </div>
        </div>

        </div>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <button onClick={onClose} disabled={saving} className="w-full sm:w-auto rounded-md border border-border px-4 py-2.5 sm:py-1.5 text-sm disabled:opacity-50">Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="w-full sm:w-auto rounded-md border border-border bg-background px-4 py-2.5 sm:py-1.5 text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            {saving ? 'Saving…' : editing ? 'Update Draft' : 'Save as Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || !balanced}
            title={!balanced ? 'Entry must be balanced before posting' : undefined}
            className="w-full sm:w-auto rounded-md bg-primary text-primary-foreground px-4 py-2.5 sm:py-1.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Posting…' : 'Save & Post'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
