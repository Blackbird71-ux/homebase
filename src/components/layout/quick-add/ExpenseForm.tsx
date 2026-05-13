'use client'

/**
 * ExpenseForm — Quick Add: Expense
 *
 * Records a double-entry expense journal:
 *   DR  Expense account  (e.g. 5.1 Office Supplies)
 *   CR  Payment account  (e.g. 1.2 Visa Card)
 *
 * Both sides are GL accounts (FinanceCategory), NOT bank accounts.
 * The form posts directly to /api/finance/journals with postImmediately=true.
 *
 * Last-used GL selections are persisted to localStorage so repeat entries
 * (same card, same expense type) require only amount + description.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sortedCategoryList } from '@/lib/finance-categories'
import { todayAU } from '@/lib/utils'
import type { QuickAddFormProps, CategoryMeta } from './types'

// ── localStorage persistence ─────────────────────────────────────────────────

const PREFS_KEY = 'homebase:quickadd:expense:v2'

interface ExpensePrefs {
  expenseCategoryId: string  // DR — expense GL account
  paymentGlId: string        // CR — asset/liability GL account (e.g. Visa Card)
}

function loadPrefs(): ExpensePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return JSON.parse(raw) as ExpensePrefs
  } catch { /* ignore */ }
  return { expenseCategoryId: '', paymentGlId: '' }
}

function savePrefs(prefs: ExpensePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

// ── Label helpers ────────────────────────────────────────────────────────────

/** Renders "1.2 · Visa Card" if glCode present, otherwise just the name. */
function glLabel(cat: CategoryMeta): string {
  return cat.glCode ? `${cat.glCode} · ${cat.name}` : cat.name
}

/** Indent sub-accounts one level in the dropdown. */
function optionLabel(cat: CategoryMeta): string {
  const label = glLabel(cat)
  return cat.parentId ? `    ${label}` : label
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExpenseForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [amount, setAmount]                     = useState('')
  const [date, setDate]                         = useState(todayAU())
  const [description, setDescription]           = useState('')
  const [expenseCategoryId, setExpenseCategoryId] = useState('')   // DR
  const [paymentGlId, setPaymentGlId]           = useState('')    // CR

  const [allCategories, setAllCategories]       = useState<CategoryMeta[]>([])
  const [dataLoading, setDataLoading]           = useState(false)
  const [submitting, setSubmitting]             = useState(false)

  // Track whether prefs were applied so we can show the "(remembered)" badge
  const [rememberedExpense, setRememberedExpense] = useState(false)
  const [rememberedPayment, setRememberedPayment] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Load GL accounts and restore last-used prefs ─────────────────────────

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
    setDataLoading(true)

    fetch('/api/finance/categories')
      .then(r => r.json())
      .then((cats: CategoryMeta[]) => {
        setAllCategories(cats)

        const prefs = loadPrefs()

        if (prefs.expenseCategoryId && cats.some(c => c.id === prefs.expenseCategoryId)) {
          setExpenseCategoryId(prefs.expenseCategoryId)
          setRememberedExpense(true)
        }
        if (prefs.paymentGlId && cats.some(c => c.id === prefs.paymentGlId)) {
          setPaymentGlId(prefs.paymentGlId)
          setRememberedPayment(true)
        }
      })
      .catch(() => toast.error('Could not load GL accounts'))
      .finally(() => setDataLoading(false))
  }, [])

  // ── Derived lists ─────────────────────────────────────────────────────────

  // DR side: expense categories only
  const expenseCategories = sortedCategoryList(
    allCategories.filter(c => c.type === 'expense')
  )

  // CR side: asset + liability categories (where payment accounts live)
  const paymentGlCategories = sortedCategoryList(
    allCategories.filter(c => c.type === 'asset' || c.type === 'liability')
  )

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsed = parseFloat(amount)
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a valid amount greater than zero')
      return
    }
    if (!expenseCategoryId) {
      toast.error('Select an expense type (the DR account)')
      return
    }
    if (!paymentGlId) {
      toast.error('Select a payment account (the CR account)')
      return
    }

    setSubmitting(true)

    // Persist selections for next time
    savePrefs({ expenseCategoryId, paymentGlId })

    try {
      const res = await fetch('/api/finance/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:            date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString(),
          description:     description.trim() || 'Expense',
          type:            'manual',
          postImmediately: true,
          lines: [
            // DR — expense hits the P&L
            { glAccountId: expenseCategoryId, side: 'debit',  amount: parsed },
            // CR — reduces the asset or increases the liability (e.g. credit card balance goes up)
            { glAccountId: paymentGlId,       side: 'credit', amount: parsed },
          ],
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to record expense')
      }

      onSuccess('Expense recorded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selectClass =
    'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ' +
    'ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'

  const loadingPlaceholder = (
    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">

      {/* Amount */}
      <div className="space-y-2">
        <Label htmlFor="qa-exp-amount">Amount ($)</Label>
        <Input
          ref={inputRef}
          id="qa-exp-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="qa-exp-date">Date</Label>
        <Input
          id="qa-exp-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* Description / Memo */}
      <div className="space-y-2">
        <Label htmlFor="qa-exp-desc">Description</Label>
        <Input
          id="qa-exp-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Office supplies from Officeworks"
        />
      </div>

      {/* DR — Expense type */}
      <div className="space-y-1.5">
        <Label htmlFor="qa-exp-dr">
          Expense Type
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(debit)</span>
          {rememberedExpense && expenseCategoryId && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">(remembered)</span>
          )}
        </Label>

        {dataLoading ? loadingPlaceholder : (
          <select
            id="qa-exp-dr"
            value={expenseCategoryId}
            onChange={e => { setExpenseCategoryId(e.target.value); setRememberedExpense(false) }}
            className={selectClass}
          >
            <option value="">Select expense account…</option>
            {expenseCategories.map(c => (
              <option key={c.id} value={c.id}>{optionLabel(c)}</option>
            ))}
          </select>
        )}

        {!expenseCategoryId && !dataLoading && (
          <p className="text-[11px] text-amber-500">
            ⚠ Required — this determines which expense appears on your P&amp;L
          </p>
        )}
      </div>

      {/* CR — Payment account (asset/liability) */}
      <div className="space-y-1.5">
        <Label htmlFor="qa-exp-cr">
          Paid From
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(credit)</span>
          {rememberedPayment && paymentGlId && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">(remembered)</span>
          )}
        </Label>

        {dataLoading ? loadingPlaceholder : paymentGlCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No asset or liability accounts found. Add them in Finance → Categories.
          </p>
        ) : (
          <select
            id="qa-exp-cr"
            value={paymentGlId}
            onChange={e => { setPaymentGlId(e.target.value); setRememberedPayment(false) }}
            className={selectClass}
          >
            <option value="">Select payment account…</option>
            {paymentGlCategories.map(c => (
              <option key={c.id} value={c.id}>{optionLabel(c)}</option>
            ))}
          </select>
        )}

        {!paymentGlId && !dataLoading && paymentGlCategories.length > 0 && (
          <p className="text-[11px] text-amber-500">
            ⚠ Required — e.g. 1.2 Visa Card, 1.1 Business Cheque, 1.5 Petty Cash
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="submit" disabled={submitting || dataLoading} className="flex-1">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Record
        </Button>
      </div>

    </form>
  )
}
