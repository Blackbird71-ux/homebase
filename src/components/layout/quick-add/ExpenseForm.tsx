'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sortedCategoryList } from '@/lib/finance-categories'
import { todayAU } from '@/lib/utils'
import type { QuickAddFormProps, CategoryMeta, AccountMeta } from './types'

const EXPENSE_PREFS_KEY = 'homebase:quickadd:expense:last'

function loadExpensePrefs(): { categoryId: string; accountId: string } {
  try {
    const raw = localStorage.getItem(EXPENSE_PREFS_KEY)
    if (raw) return JSON.parse(raw) as { categoryId: string; accountId: string }
  } catch { /* ignore */ }
  return { categoryId: '', accountId: '' }
}

function saveExpensePrefs(prefs: { categoryId: string; accountId: string }) {
  try { localStorage.setItem(EXPENSE_PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

function accountLabel(a: AccountMeta): string {
  return a.institution ? `${a.name} · ${a.institution}` : a.name
}

export function ExpenseForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayAU())
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categories, setCategories] = useState<CategoryMeta[]>([])
  const [accounts, setAccounts] = useState<AccountMeta[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
    setDataLoading(true)
    Promise.all([
      fetch('/api/finance/categories').then(r => r.json()),
      fetch('/api/finance/accounts').then(r => r.json()),
    ])
      .then(([cats, accts]: [CategoryMeta[], AccountMeta[]]) => {
        setCategories(cats)
        setAccounts(accts)
        const prefs = loadExpensePrefs()
        if (prefs.categoryId && cats.some(c => c.id === prefs.categoryId)) setCategoryId(prefs.categoryId)
        if (prefs.accountId && accts.some(a => a.id === prefs.accountId)) setAccountId(prefs.accountId)
      })
      .catch(() => { /* silently fail */ })
      .finally(() => setDataLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount.trim()) { toast.error('Amount is required'); return }
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) { toast.error('Enter a valid amount'); return }
    setSubmitting(true)
    saveExpensePrefs({ categoryId, accountId })
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          amount: parsed,
          description: description.trim() || null,
          categoryId: categoryId || null,
          accountId: accountId || null,
          date: date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString(),
          isCleared: true,
        }),
      })
      if (!res.ok) throw new Error('Failed to log expense')
      onSuccess('Expense logged')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-expense-amount">Amount ($)</Label>
        <Input
          ref={inputRef}
          id="qa-expense-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-expense-date">Date</Label>
        <Input id="qa-expense-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-expense-desc">Description</Label>
        <Input
          id="qa-expense-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g., Weekly groceries"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-expense-cat">
          Category
          {categoryId && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(remembered)</span>}
        </Label>
        {dataLoading ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
          </div>
        ) : (
          <select
            id="qa-expense-cat"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">No category…</option>
            {sortedCategoryList(categories.filter(c => c.type === 'expense')).map(c => (
              <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
            ))}
          </select>
        )}
        {!categoryId && !dataLoading && (
          <p className="text-[11px] text-amber-500">⚠ Without a category this will show as Uncategorised on P&amp;L</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qa-expense-account">
          Account
          {accountId && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(remembered)</span>}
        </Label>
        {dataLoading ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts set up yet.</p>
        ) : (
          <select
            id="qa-expense-account"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">No account…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create
        </Button>
      </div>
    </form>
  )
}
