'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Account {
  id: string; name: string; type: string; institution: string | null
  currency: string; currentBalance: number; creditLimit: number | null
  isActive: boolean; color: string | null; icon: string | null; sortOrder: number
}

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'other'] as const

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState({
    name: '', type: 'checking', institution: '', currency: 'AUD',
    currentBalance: 0, creditLimit: '', color: '#6366F1', icon: '',
  })

  async function load() {
    setLoading(true)
    try { const res = await fetch('/api/finance/accounts'); if (res.ok) setAccounts(await res.json()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null); setForm({ name: '', type: 'checking', institution: '', currency: 'AUD', currentBalance: 0, creditLimit: '', color: '#6366F1', icon: '' })
    setShowForm(true)
  }
  function openEdit(acct: Account) {
    setEditing(acct); setForm({
      name: acct.name, type: acct.type, institution: acct.institution ?? '',
      currency: acct.currency, currentBalance: acct.currentBalance,
      creditLimit: acct.creditLimit?.toString() ?? '', color: acct.color ?? '#6366F1', icon: acct.icon ?? '',
    }); setShowForm(true)
  }

  async function handleSave() {
    const body = {
      ...(editing ? { id: editing.id } : {}),
      ...form,
      creditLimit: form.type === 'credit' ? parseFloat(form.creditLimit) || 0 : null,
    }
    const res = await fetch('/api/finance/accounts', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Account updated' : 'Account created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account? Transactions will be unlinked.')) return
    const res = await fetch(`/api/finance/accounts?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Account deleted'); load() }
    else toast.error('Failed to delete')
  }

  function formatCurrency(amount: number, currency = 'AUD') {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading accounts…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Account' : 'New Account'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type *</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Institution</label>
              <input value={form.institution} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Currency</label>
              <input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Current Balance</label>
              <input type="number" step="0.01" value={form.currentBalance}
                onChange={e => setForm(p => ({ ...p, currentBalance: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            {form.type === 'credit' && (
              <div>
                <label className="text-xs text-muted-foreground">Credit Limit</label>
                <input type="number" step="0.01" value={form.creditLimit}
                  onChange={e => setForm(p => ({ ...p, creditLimit: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="h-8 w-8 rounded cursor-pointer" />
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

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet. Add your first account above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: a.color ?? '#6B7280' }} />
                <span className="font-medium truncate">{a.name}</span>
                {!a.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
              </div>
              {a.institution && <p className="text-xs text-muted-foreground mb-1">{a.institution}</p>}
              <p className="text-xl font-bold mb-2">{formatCurrency(a.currentBalance, a.currency)}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-muted px-2 py-0.5 rounded-full">{a.type}</span>
                {a.type === 'credit' && a.creditLimit && (
                  <span className="text-muted-foreground">Limit: {formatCurrency(a.creditLimit, a.currency)}</span>
                )}
              </div>
              <div className="flex gap-1 mt-3">
                <button onClick={() => openEdit(a)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(a.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}