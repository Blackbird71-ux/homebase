'use client'

/**
 * JournalLinesEditor
 *
 * Reusable double-entry journal lines widget used by:
 *  - Journal entries page (new / edit draft)
 *  - Bill create / edit modal
 *  - Income create / edit modal
 *
 * The parent controls the lines array via value/onChange (controlled component).
 * Pre-seeding (e.g. DR expense / CR Accounts Payable) is done by the parent
 * before passing the initial value.
 */

import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GLAccount {
  id: string
  name: string
  type: string        // asset | liability | equity | income | expense
  glCode: string | null
  parentId: string | null
  isTaxPayment?: boolean       // PAYG/tax-payment flag — payslip GL soft-validation (P5-FC-03)
  memberId?: string | null     // member attribution — payslip GL soft-validation (P5-FC-03)
}

export interface JournalFormLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: string      // string for input handling; caller parses on save
  description: string
}

interface Props {
  lines: JournalFormLine[]
  onChange: (lines: JournalFormLine[]) => void
  glAccounts: GLAccount[]
  disabled?: boolean
  /** If provided, show a warning when lines don't sum to this total */
  expectedTotal?: number
  /** Extra class on the outer container */
  className?: string
  errors?: Record<string, string>   // keyed: line_0_account, line_0_amount, balance
  onErrorsClear?: (keys: string[]) => void
  /** Optional per-line hints shown below the account selector, e.g. "Accounts Payable (liability)" */
  lineHints?: (string | undefined)[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalSide(type: string): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit'
}

function fmt(n: number): string {
  return formatCurrency(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupedAccounts(accounts: GLAccount[]) {
  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
  const result: GLAccount[] = []
  for (const type of typeOrder) {
    const roots = accounts.filter(a => a.type === type && !a.parentId).sort((a, b) => a.name.localeCompare(b.name))
    const children = accounts.filter(a => a.type === type && a.parentId).sort((a, b) => a.name.localeCompare(b.name))
    for (const root of roots) {
      result.push(root)
      result.push(...children.filter(c => c.parentId === root.id))
    }
  }
  return result
}

function accountLabel(acct: GLAccount): string {
  const code   = acct.glCode ? `[${acct.glCode}] ` : ''
  const indent = acct.parentId ? '\u2014 ' : ''
  return `${indent}${code}${acct.name} (${acct.type})`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JournalLinesEditor({
  lines,
  onChange,
  glAccounts,
  disabled = false,
  expectedTotal,
  className,
  errors = {},
  onErrorsClear,
  lineHints = [],
}: Props) {

  const grouped = groupedAccounts(glAccounts.filter(a => a.type !== 'transfer'))

  // ── Derived totals ─────────────────────────────────────────────────────────
  let debitTotal = 0
  let creditTotal = 0
  for (const line of lines) {
    const amt = parseFloat(line.amount) || 0
    if (line.side === 'debit')  debitTotal  += amt
    else                        creditTotal += amt
  }
  debitTotal  = Math.round(debitTotal  * 100) / 100
  creditTotal = Math.round(creditTotal * 100) / 100
  const difference = Math.round(Math.abs(debitTotal - creditTotal) * 100) / 100
  const balanced   = difference < 0.005

  // Check if lines balance to expected total
  const totalMismatch = expectedTotal != null && Math.abs(creditTotal - expectedTotal) > 0.005 && Math.abs(debitTotal - expectedTotal) > 0.005

  // ── Handlers ───────────────────────────────────────────────────────────────

  function updateLine(index: number, field: keyof JournalFormLine, value: string) {
    const next = lines.map((l, i) => i === index ? { ...l, [field]: value } : l)
    onChange(next)
    if (onErrorsClear) {
      onErrorsClear([`line_${index}_account`, `line_${index}_amount`, 'balance'])
    }
  }

  function addLine() {
    onChange([...lines, { glAccountId: '', side: 'debit', amount: '', description: '' }])
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return
    onChange(lines.filter((_, i) => i !== index))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn('space-y-2', className)}>

      {/* ── Section header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Journal Lines</p>
        <p className="text-xs text-muted-foreground">Debits must equal credits</p>
      </div>

      {/* ── Column headers — desktop only ────────────────────────────────── */}
      <div className="hidden sm:grid gap-2 px-1 mb-1"
        style={{ gridTemplateColumns: 'minmax(130px, 1fr) 82px 100px 28px' }}>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">GL Account</span>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center">Side</span>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Amount ($)</span>
        <span />
      </div>

      {/* ── Line rows ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {lines.map((line, i) => {
          const acct = glAccounts.find(a => a.id === line.glAccountId)
          const hasAccountError = !!errors[`line_${i}_account`]
          const hasAmountError  = !!errors[`line_${i}_amount`]

          return (
            <div key={i}>

              {/* Desktop: single-row 4-column grid (sm+) */}
              <div className="hidden sm:grid gap-2 items-start"
                style={{ gridTemplateColumns: 'minmax(130px, 1fr) 82px 100px 28px' }}>
                <div>
                  <select value={line.glAccountId} onChange={e => updateLine(i, 'glAccountId', e.target.value)} disabled={disabled}
                    title={acct ? `Normal: ${normalSide(acct.type)} balance (${acct.type})` : undefined}
                    className={cn('w-full rounded-md border bg-background px-2 py-1.5 text-sm',
                      hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}>
                    <option value="">Select account…</option>
                    {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
                      const group = grouped.filter(a => a.type === type)
                      if (!group.length) return null
                      return (
                        <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                          {group.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                        </optgroup>
                      )
                    })}
                  </select>
                  {!acct && lineHints[i] ? (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 pl-0.5 italic">{lineHints[i]}</p>
                  ) : null}
                  {hasAccountError && <p className="text-xs text-red-500 mt-0.5">{errors[`line_${i}_account`]}</p>}
                </div>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button type="button" onClick={() => updateLine(i, 'side', 'debit')} disabled={disabled}
                    className={cn('flex-1 py-1.5 text-xs font-medium transition-colors',
                      line.side === 'debit' ? 'bg-green-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground')}>DR</button>
                  <button type="button" onClick={() => updateLine(i, 'side', 'credit')} disabled={disabled}
                    className={cn('flex-1 py-1.5 text-xs font-medium transition-colors',
                      line.side === 'credit' ? 'bg-red-600 text-white' : 'bg-background text-muted-foreground hover:text-foreground')}>CR</button>
                </div>
                <div>
                  <input type="number" step="0.01" min="0" value={line.amount}
                    onChange={e => updateLine(i, 'amount', e.target.value)}
                    placeholder="0.00" disabled={disabled}
                    className={cn('w-full rounded-md border bg-background px-2 py-1.5 text-sm text-right',
                      hasAmountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')} />
                  {hasAmountError && <p className="text-xs text-red-500 mt-0.5 text-right">{errors[`line_${i}_amount`]}</p>}
                </div>
                <button type="button" onClick={() => removeLine(i)} disabled={disabled || lines.length <= 2}
                  title="Remove line"
                  className="p-1 hover:bg-accent rounded text-red-500 disabled:opacity-30 disabled:cursor-not-allowed mt-0.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Mobile: stacked card layout (< sm) */}
              <div className="sm:hidden rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                {/* Account — full width */}
                <select value={line.glAccountId} onChange={e => updateLine(i, 'glAccountId', e.target.value)} disabled={disabled}
                  title={acct ? `Normal: ${normalSide(acct.type)} balance (${acct.type})` : undefined}
                  className={cn('w-full rounded-md border bg-background px-2 py-2 text-sm',
                    hasAccountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}>
                  <option value="">Select account…</option>
                  {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
                    const group = grouped.filter(a => a.type === type)
                    if (!group.length) return null
                    return (
                      <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                        {group.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
                {hasAccountError && <p className="text-xs text-red-500">{errors[`line_${i}_account`]}</p>}
                {/* DR/CR + amount + delete on one row */}
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                    <button type="button" onClick={() => updateLine(i, 'side', 'debit')} disabled={disabled}
                      className={cn('px-3.5 py-2 text-sm font-semibold transition-colors',
                        line.side === 'debit' ? 'bg-green-600 text-white' : 'bg-background text-muted-foreground')}>DR</button>
                    <button type="button" onClick={() => updateLine(i, 'side', 'credit')} disabled={disabled}
                      className={cn('px-3.5 py-2 text-sm font-semibold transition-colors',
                        line.side === 'credit' ? 'bg-red-600 text-white' : 'bg-background text-muted-foreground')}>CR</button>
                  </div>
                  <input type="number" step="0.01" min="0" value={line.amount}
                    onChange={e => updateLine(i, 'amount', e.target.value)}
                    placeholder="0.00" disabled={disabled}
                    className={cn('flex-1 rounded-md border bg-background px-3 py-2 text-base text-right',
                      hasAmountError ? 'border-red-500 ring-1 ring-red-500' : 'border-input')} />
                  <button type="button" onClick={() => removeLine(i)} disabled={disabled || lines.length <= 2}
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

      {/* ── Add line ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={addLine}
        disabled={disabled}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>

      {/* ── Balance indicator ─────────────────────────────────────────────── */}
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

      {/* ── Expected total mismatch warning ──────────────────────────────── */}
      {totalMismatch && expectedTotal != null && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex gap-2 items-start">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Journal lines total ({fmt(Math.max(debitTotal, creditTotal))}) doesn&apos;t match
            the bill/income amount ({fmt(expectedTotal)}). This is allowed (e.g. for GST splits)
            but please verify the amounts are correct.
          </span>
        </div>
      )}

      {/* ── Balance error from parent validation ─────────────────────────── */}
      {errors.balance && (
        <p className="text-xs text-red-500">{errors.balance}</p>
      )}
    </div>
  )
}
