'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface Category { id: string; name: string; type: string; color: string | null }
interface Account { id: string; name: string; type: string }

interface Transaction {
  id: string; accountId: string | null; categoryId: string | null
  type: string; amount: number; payee: string | null; description: string | null
  date: string; isRecurring: boolean; isCleared: boolean; isPrivate: boolean
  category: Category | null; account: Account | null
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [filterType, setFilterType] = useState('')
  const [form, setForm] = useState({
    accountId: '', categoryId: '', type: 'expense', amount: 0,
    payee: '', description: '', date: new Date().toISOString().split('T')[0],
    isCleared: false, isPrivate: false,
  })

  const limit = 50

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (filterType) params.set('type', filterType)
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) { const d = await res.json(); setTransactions(d.transactions); setTotal(d.total) }
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const [aRes, cRes] = await Promise.all([
      fetch('/api/finance/accounts'), fetch('/api/finance/categories'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { load() }, [page, filterType])

  const totalPages = Math.ceil(total / limit)

  function openNew() {
    setEditing(null)
    setForm({ accountId: '', categoryId: '', type: 'expense', amount: 0, payee: '', description: '', date: new Date().toISOString().split('T')[0], isCleared: false, isPrivate: false })
    setShowForm(true)
  }

  function openEdit(t: Transaction) {
    setEditing(t)
    setForm({
      accountId: t.accountId ?? '', categoryId: t.categoryId ?? '', type: t.type,
      amount: t.amount, payee: t.payee ?? '', description: t.description ?? '',
      date: t.date.split('T')[0], isCleared: t.isCleared, isPrivate: t.isPrivate,
    })
    setShowForm(true)
  }

  async function handleSave() {
    const body = editing ? { id: editing.id, ...form, accountId: form.accountId || null, categoryId: form.categoryId || null } : { ...form, accountId: form.accountId || null, categoryId: form.categoryId || null }
    const res = await fetch('/api/finance/transactions', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Transaction updated' : 'Transaction created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return
    const res = await fetch(`/api/finance/transactions?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Transaction deleted'); load() }
    else toast.error('Failed to delete')
  }

  function formatCurrency(amount: number) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount) }

  if (loading && transactions.length === 0) return <div className="p-4 text-muted-foreground">Loading transactions…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex items-center gap-2">
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs">
            <option value="">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
          <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add Transaction
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Transaction' : 'New Transaction'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Type *</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Payee</label>
              <input value={form.payee} onChange={e => setForm(p => ({ ...p, payee: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
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
                <option value="">Uncategorized</option>
                {categories.filter(c => c.type === form.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.isCleared}
                  onChange={e => setForm(p => ({ ...p, isCleared: e.target.checked }))} />
                Cleared
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.isPrivate}
                  onChange={e => setForm(p => ({ ...p, isPrivate: e.target.checked }))} />
                Private
              </label>
            </div>
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

      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions found.</p>
      ) : (
        <div className="space-y-2">
          {transactions.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50">
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                t.type === 'income' ? 'bg-green-500/10 text-green-500' : t.type === 'transfer' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500')}>
                {t.type === 'income' ? '+' : t.type === 'transfer' ? '↔' : '-'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{t.payee ?? t.description ?? 'Transaction'}</span>
                  {!t.isCleared && <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 rounded">PENDING</span>}
                  {t.isPrivate && <span className="text-[10px] bg-muted px-1.5 rounded">PRIVATE</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t.category && <span>{t.category.name}</span>}
                  {t.account && <span>{t.account.name}</span>}
                  <span>{format(new Date(t.date), 'd MMM yyyy')}</span>
                </div>
              </div>
              <p className={cn('text-sm font-semibold', t.type === 'income' ? 'text-green-500' : t.type === 'transfer' ? 'text-blue-500' : 'text-red-500')}>
                {t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '-'}{formatCurrency(t.amount)}
              </p>
              <button onClick={() => openEdit(t)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  )
}