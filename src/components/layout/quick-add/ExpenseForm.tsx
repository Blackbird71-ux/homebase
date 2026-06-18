'use client'

/**
 * ExpenseForm — Quick Add: Expense
 *
 * Records a double-entry expense paid from a bank/card account:
 *   DR  Expense account   (e.g. 5.1 Office Supplies)
 *   CR  Bank account       (the FinanceAccount's bound 1:1 GL category)
 *
 * The DR side is a GL expense category; the cash (CR) side is a FinanceAccount
 * (Xero "bank = GL account, 1:1" model), never a raw asset/liability GL
 * category — so the cash always moves an account the dashboard / Accounts page /
 * Balance Sheet read from, and the balances reconcile by construction.
 *
 * Posts to /api/finance/transactions (type='expense', accountId + categoryId),
 * the same account-bound, GST-aware path the manual transactions register uses.
 * The server resolves the account to its bound GL category and posts the journal
 * (splitting GST when the expense category is GST-applicable).
 *
 * Last-used selections are persisted to localStorage so repeat entries
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
import type { QuickAddFormProps, CategoryMeta, AccountMeta } from './types'

// ── localStorage persistence ─────────────────────────────────────────────────

// v3: the payment side is now a FinanceAccount id, not a GL category id. The key
// is bumped so a stale v2 category id is never misapplied as an account id.
const PREFS_KEY = 'homebase:quickadd:expense:v3'

interface ExpensePrefs {
  expenseCategoryId: string  // DR — expense GL account
  paymentAccountId: string   // CR — FinanceAccount paid from (bank/card)
}

function loadPrefs(): ExpensePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return JSON.parse(raw) as ExpensePrefs
  } catch { /* ignore */ }
  return { expenseCategoryId: '', paymentAccountId: '' }
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
  const [paymentAccountId, setPaymentAccountId] = useState('')    // CR (bank/card account)

  const [allCategories, setAllCategories]       = useState<CategoryMeta[]>([])
  const [accounts, setAccounts]                 = useState<AccountMeta[]>([])
  const [dataLoading, setDataLoading]           = useState(false)
  const [submitting, setSubmitting]             = useState(false)

  // Track whether prefs were applied so we can show the "(remembered)" badge
  const [rememberedExpense, setRememberedExpense] = useState(false)
  const [rememberedPayment, setRememberedPayment] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Load expense categories + accounts, restore last-used prefs ──────────

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
    setDataLoading(true)

    Promise.all([
      fetch('/api/finance/categories').then(r => r.json()),
      fetch('/api/finance/accounts').then(r => r.json()),
    ])
      .then(([cats, accts]: [CategoryMeta[], AccountMeta[]]) => {
        setAllCategories(cats)
        setAccounts(accts)

        const prefs = loadPrefs()

        if (prefs.expenseCategoryId && cats.some(c => c.id === prefs.expenseCategoryId)) {
          setExpenseCategoryId(prefs.expenseCategoryId)
          setRememberedExpense(true)
        }
        if (prefs.paymentAccountId && accts.some(a => a.id === prefs.paymentAccountId)) {
          setPaymentAccountId(prefs.paymentAccountId)
          setRememberedPayment(true)
        }
      })
      .catch(() => toast.error('Could not load accounts'))
      .finally(() => setDataLoading(false))
  }, [])

  // ── Derived lists ─────────────────────────────────────────────────────────

  // DR side: expense categories only
  const expenseCategories = sortedCategoryList(
    allCategories.filter(c => c.type === 'expense')
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
    if (!paymentAccountId) {
      toast.error('Select an account to pay from')
      return
    }

    setSubmitting(true)

    // Persist selections for next time
    savePrefs({ expenseCategoryId, paymentAccountId })

    try {
      // Post via the account-bound transactions path: the server resolves the
      // selected FinanceAccount to its bound GL category for the cash (CR) side
      // and posts the double-entry journal (splitting GST when the expense
      // category is GST-applicable). DR = expense category, CR = bank account.
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:        'expense',
          accountId:   paymentAccountId,
          categoryId:  expenseCategoryId,
          amount:      parsed,
          description: description.trim() || 'Expense',
          date:        date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString(),
          isCleared:   true,
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to record expense')
      }
      // Non-fatal GL warning (e.g. GST control account missing): the transaction
      // saved but its journal is incomplete — surface it rather than swallow it.
      if (body.warning) toast.warning(body.warning)

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
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(debit)</span>
          {rememberedExpense && expenseCategoryId && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(remembered)</span>
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
          <p className="text-xs text-amber-500">
            ⚠ Required — this determines which expense appears on your P&amp;L
          </p>
        )}
      </div>

      {/* CR — Account paid from (bank/card) */}
      <div className="space-y-1.5">
        <Label htmlFor="qa-exp-cr">
          Paid From
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(credit)</span>
          {rememberedPayment && paymentAccountId && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(remembered)</span>
          )}
        </Label>

        {dataLoading ? loadingPlaceholder : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts found. Add a bank or card account in Finance → Accounts.
          </p>
        ) : (
          <select
            id="qa-exp-cr"
            value={paymentAccountId}
            onChange={e => { setPaymentAccountId(e.target.value); setRememberedPayment(false) }}
            className={selectClass}
          >
            <option value="">Select account…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.institution ? `${a.name} · ${a.institution}` : a.name}
              </option>
            ))}
          </select>
        )}

        {!paymentAccountId && !dataLoading && accounts.length > 0 && (
          <p className="text-xs text-amber-500">
            ⚠ Required — the bank or card account the money came out of
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
