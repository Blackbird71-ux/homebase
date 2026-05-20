'use client'

/**
 * AmendmentDialog — Correct a posted journal entry
 *
 * Accounting workflow (GL-first, immutable ledger):
 *   1. User opens this dialog from a posted manual/adjustment entry.
 *   2. Dialog pre-populates with the original lines so the user can see what needs fixing.
 *   3. On submit, the API atomically:
 *        a. Posts a reversal entry (flipped DR/CR) to zero out the original GL effect.
 *        b. Marks the original isReversed = true.
 *        c. Posts a new corrective entry (amendmentOfId → original) with the corrected lines.
 *   4. Both new entries get their own reference numbers for traceability.
 *
 * The original entry is never mutated — the GL audit trail is preserved in full.
 */

import { useEffect, useState } from 'react'
import { FilePenLine, AlertTriangle, Send, CheckCircle2, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn, todayAU } from '@/lib/utils'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/sheet'
import {
  type JournalEntry, type GLAccount, type Entity, type FormLine, type AmendmentState,
  fmt, normalSide, MANUAL_TYPES,
} from './journal-types'

interface Props {
  amendment: AmendmentState | null
  glAccounts: GLAccount[]
  entities: Entity[]
  onClose: () => void
  onSaved: () => void
}

export function AmendmentDialog({ amendment, glAccounts, entities, onClose, onSaved }: Props) {
  const [correctionDate, setCorrectionDate]           = useState('')
  const [correctionDescription, setCorrectionDescription] = useState('')
  const [correctionEntityId, setCorrectionEntityId]   = useState('')
  const [lines, setLines]                             = useState<FormLine[]>([])
  const [errors, setErrors]                           = useState<Record<string, string>>({})
  const [saving, setSaving]                           = useState(false)
  const [confirmed, setConfirmed]                     = useState(false)

  const entry = amendment?.entry ?? null

  // Pre-populate when the dialog opens
  useEffect(() => {
    if (!amendment) return
    setCorrectionDate(amendment.correctionDate)
    setCorrectionDescription(
      `Amendment of ${amendment.entry.reference ?? amendment.entry.id}: ${amendment.entry.description}`,
    )
    setCorrectionEntityId(amendment.entry.entityId ?? '')
    setLines(
      amendment.entry.lines.map(l => ({
        glAccountId: l.glAccountId,
        side:        l.side,
        amount:      l.amount.toFixed(2),
        description: l.description ?? '',
      })),
    )
    setErrors({})
    setConfirmed(false)
  }, [amendment?.entry.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Line helpers ────────────────────────────────────────────────────────────

  function addLine() {
    setLines(p => [...p, { glAccountId: '', side: 'debit', amount: '', description: '' }])
  }

  function removeLine(index: number) {
    if (lines.length <= 2) { toast.error('A journal entry requires at least 2 lines.'); return }
    setLines(p => p.filter((_, i) => i !== index))
    setErrors(p => {
      const next = { ...p }
      delete next[`line_${index}_account`]
      delete next[`line_${index}_amount`]
      return next
    })
  }

  function updateLine(index: number, field: keyof FormLine, value: string) {
    setLines(p => p.map((l, i) => i === index ? { ...l, [field]: value } : l))
    setErrors(p => {
      const next = { ...p }
      delete next[`line_${index}_account`]
      delete next[`line_${index}_amount`]
      delete next.balance
      return next
    })
  }

  // ── Totals ──────────────────────────────────────────────────────────────────

  function getLineTotals() {
    let debit = 0, credit = 0
    for (const line of lines) {
      const amt = parseFloat(line.amount) || 0
      if (line.side === 'debit') debit += amt
      else credit += amt
    }
    return {
      debitTotal:  Math.round(debit  * 100) / 100,
      creditTotal: Math.round(credit * 100) / 100,
      difference:  Math.round(Math.abs(debit - credit) * 100) / 100,
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!correctionDate)               errs.date        = 'Correction date is required'
    if (!correctionDescription.trim()) errs.description = 'Description is required'
    if (lines.length < 2)             errs.lines       = 'At least 2 lines are required'
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.glAccountId) errs[`line_${i}_account`] = 'Select a GL account'
      const amt = parseFloat(line.amount)
      if (!line.amount || isNaN(amt) || amt <= 0) errs[`line_${i}_amount`] = 'Enter amount > 0'
    }
    const { difference } = getLineTotals()
    if (difference > 0.005) errs.balance = `Debits must equal credits. Difference: ${fmt(difference)}`
    return errs
  }

  // ── GL account options ──────────────────────────────────────────────────────

  function glAccountOptions(): GLAccount[] {
    const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
    const result: GLAccount[] = []
    for (const type of typeOrder) {
      const roots    = glAccounts.filter(a => a.type === type && !a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      const children = glAccounts.filter(a => a.type === type && a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      for (const root of roots) { result.push(root); result.push(...children.filter(c => c.parentId === root.id)) }
    }
    return result
  }

  function glAccountLabel(acct: GLAccount): string {
    return `${acct.parentId ? '— ' : ''}${acct.glCode ? `[${acct.glCode}] ` : ''}${acct.name} (${acct.type})`
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!entry) return

    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (!confirmed) {
      setConfirmed(true)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/finance/journals', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:                     entry.id,
          action:                 'amend',
          correctionDate,
          correctionDescription:  correctionDescription.trim(),
          correctionEntityId:     correctionEntityId || null,
          correctionLines: lines.map(l => ({
            glAccountId: l.glAccountId,
            side:        l.side,
            amount:      parseFloat(l.amount),
            description: l.description || null,
          })),
        }),
      })
      if (res.ok) {
        const result = await res.json()
        toast.success(
          `${entry.reference ?? 'Entry'} amended — reversal and corrective entry posted (${result.reference ?? ''})`,
        )
        onClose()
        onSaved()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to amend entry')
        setConfirmed(false)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const { debitTotal, creditTotal, difference } = getLineTotals()
  const balanced = difference < 0.005

  return (
    <Drawer open={!!amendment} onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DrawerContent className="sm:max-w-[720px]" showCloseButton={!saving}>
        <DrawerHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border">
          <DrawerTitle className="flex items-center gap-2">
            <FilePenLine className="h-4 w-4 text-blue-500" />
            Correct Posted Journal Entry
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
        {entry && (
          <>
            {/* Original entry summary */}
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm space-y-0.5">
              <p className="text-xs text-muted-foreground">Correcting original entry:</p>
              <p className="font-medium font-mono text-xs">{entry.reference}</p>
              <p className="font-medium">{entry.description}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(entry.date), 'd MMM yyyy')}</p>
            </div>

            {/* Accounting warning */}
            <div className={cn(
              'rounded-md px-3 py-2 text-xs flex gap-2 items-start border',
              confirmed
                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
            )}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {confirmed ? (
                <span>
                  <strong>Confirm:</strong> This will post a reversal of {entry.reference} and a new
                  corrective entry — both immediately. The original will be marked AMENDED. This cannot be undone.
                </span>
              ) : (
                <span>
                  The original entry will be reversed (its GL effect zeroed out) and a new corrective entry
                  will be posted in its place. The original entry remains on the ledger marked as AMENDED
                  for full audit trail. Both new entries get their own reference numbers.
                </span>
              )}
            </div>

            {/* Validation errors */}
            {Object.keys(errors).length > 0 && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                <p className="font-medium mb-1">Please fix the following:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {/* Correction date + description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Correction date <span className="text-amber-500">*</span>
                  <span className="ml-1 italic">(not the original date)</span>
                </label>
                <input
                  type="date"
                  value={correctionDate}
                  onChange={e => { setCorrectionDate(e.target.value); setErrors(p => ({ ...p, date: '' })) }}
                  className={cn(
                    'w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm',
                    errors.date ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                  )}
                  disabled={saving}
                />
                {errors.date && <p className="text-xs text-red-500 mt-0.5">{errors.date}</p>}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Entity (optional)</label>
                <select
                  value={correctionEntityId}
                  onChange={e => setCorrectionEntityId(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={saving}
                >
                  <option value="">No entity / household</option>
                  {entities.map(en => (
                    <option key={en.id} value={en.id}>{en.name}{en.isDefault ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Description <span className="text-amber-500">*</span></label>
                <input
                  value={correctionDescription}
                  onChange={e => { setCorrectionDescription(e.target.value); setErrors(p => ({ ...p, description: '' })) }}
                  className={cn(
                    'w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm',
                    errors.description ? 'border-red-500 ring-1 ring-red-500' : 'border-input',
                  )}
                  disabled={saving}
                />
                {errors.description && <p className="text-xs text-red-500 mt-0.5">{errors.description}</p>}
              </div>
            </div>

            {/* Corrected journal lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Corrected Lines
                </p>
                <p className="text-xs text-muted-foreground">Edit lines below to reflect the correct amounts</p>
              </div>

              {/* Desktop column headers */}
              <div className="hidden sm:grid gap-2 mb-1 px-1" style={{ gridTemplateColumns: '1fr 82px 100px 28px' }}>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">GL Account</span>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center">Side</span>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Amount ($)</span>
                <span />
              </div>

              <div className="space-y-2">
                {lines.map((line, i) => {
                  const acct = glAccounts.find(a => a.id === line.glAccountId)
                  const hasAccountError = !!errors[`line_${i}_account`]
                  const hasAmountError  = !!errors[`line_${i}_amount`]
                  return (
                    <div key={i}>
                      {/* Desktop: 4-col grid */}
                      <div className="hidden sm:grid gap-2 items-start" style={{ gridTemplateColumns: '1fr 82px 100px 28px' }}>
                        <div>
                          <select value={line.glAccountId} onChange={e => updateLine(i, 'glAccountId', e.target.value)}
                            className={cn('w-full rounded-md border bg-background px-2 py-1.5 text-sm', hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
                            disabled={saving}>
                            <option value="">Select account…</option>
                            {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
                              const groupAccounts = glAccountOptions().filter(a => a.type === type)
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
                        <button type="button" onClick={() => removeLine(i)} disabled={saving || lines.length <= 2}
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
                          {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
                            const groupAccounts = glAccountOptions().filter(a => a.type === type)
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
                          <button type="button" onClick={() => removeLine(i)} disabled={saving || lines.length <= 2}
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

            {/* Balance indicator */}
            <div className={cn(
              'rounded-md px-4 py-2.5 flex items-center justify-between text-sm',
              balanced ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30',
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
                    <AlertTriangle className="h-4 w-4" /> Difference: {fmt(difference)}
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
          </>
        )}

        </div>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <button onClick={onClose} disabled={saving}
            className="w-full sm:w-auto rounded-md border border-border px-4 py-2.5 sm:py-1.5 text-sm disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !balanced}
            title={!balanced ? 'Entry must be balanced before submitting' : undefined}
            className={cn(
              'w-full sm:w-auto rounded-md px-4 py-2.5 sm:py-1.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5',
              confirmed ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700',
            )}>
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Posting amendment…' : confirmed ? 'Confirm & Post Amendment' : 'Review & Amend'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
