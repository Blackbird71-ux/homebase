'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHero } from '@/components/shared/PageHero'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ColorPicker } from '@/components/ui/color-picker'

interface Account {
  id: string; name: string; type: string; institution: string | null
  currency: string; currentBalance: number; creditLimit: number | null
  isActive: boolean; color: string | null; icon: string | null; sortOrder: number
  pendingCount: number; pendingExpense: number; pendingIncome: number
  openingBalance: number | null; openingBalanceDate: string | null
}

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'entity_account', 'external_account', 'other'] as const

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState({
    name: '', type: 'checking', institution: '', currency: 'AUD',
    creditLimit: '', color: '#6366F1', icon: '',
    openingBalance: '', openingBalanceDate: '',
  })
  // Opening balance edit for existing accounts
  const [obEdit, setObEdit] = useState<{ account: Account; amount: string; date: string } | null>(null)
  const [obSaving, setObSaving] = useState(false)

  async function load() {
    setLoading(true)
    try { const res = await fetch('/api/finance/accounts'); if (res.ok) setAccounts(await res.json()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null); setForm({ name: '', type: 'checking', institution: '', currency: 'AUD', creditLimit: '', color: '#6366F1', icon: '', openingBalance: '', openingBalanceDate: '' })
    setShowForm(true)
  }
  function openEdit(acct: Account) {
    setEditing(acct); setForm({
      name: acct.name, type: acct.type, institution: acct.institution ?? '',
      currency: acct.currency,
      creditLimit: acct.creditLimit?.toString() ?? '', color: acct.color ?? '#6366F1', icon: acct.icon ?? '',
      openingBalance: acct.openingBalance?.toString() ?? '', openingBalanceDate: acct.openingBalanceDate ?? '',
    }); setShowForm(true)
  }

  async function handleSave() {
    const body: Record<string, any> = {
      ...(editing ? { id: editing.id } : {}),
      name: form.name,
      type: form.type,
      institution: form.institution,
      currency: form.currency,
      creditLimit: form.type === 'credit' ? parseFloat(form.creditLimit) || 0 : null,
      color: form.color,
      icon: form.icon,
    }
    // Only send opening balance on new accounts
    if (!editing) {
      body.openingBalance = form.openingBalance ? parseFloat(form.openingBalance) : null
      body.openingBalanceDate = form.openingBalanceDate || null
    }
    const res = await fetch('/api/finance/accounts', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Account updated' : 'Account created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  function openObEdit(acct: Account) {
    setObEdit({
      account: acct,
      amount: acct.openingBalance?.toString() ?? '',
      date: acct.openingBalanceDate
        ? new Date(acct.openingBalanceDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    })
  }

  async function handleObSave() {
    if (!obEdit) return
    const amount = obEdit.amount !== '' ? parseFloat(obEdit.amount) : null
    setObSaving(true)
    try {
      const res = await fetch('/api/finance/accounts/opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: obEdit.account.id,
          amount,
          date: obEdit.date || null,
        }),
      })
      if (res.ok) {
        toast.success(
          amount == null || amount === 0
            ? 'Opening balance cleared'
            : `Opening balance set to ${formatCurrency(amount)}`
        )
        setObEdit(null)
        load()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to update opening balance')
      }
    } finally {
      setObSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account? Transactions will be unlinked.')) return
    const res = await fetch(`/api/finance/accounts?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Account deleted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  function formatCurrency(amount: number, currency = 'AUD') {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading accounts…</div>

  return (
    <div className="space-y-4">
      <PageHero title="Accounts" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Account
        </button>
      </div>

      {/* Opening Balance Edit Dialog */}
      <Dialog open={!!obEdit} onOpenChange={open => { if (!open) setObEdit(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>Edit Opening Balance — {obEdit?.account.name}</DialogTitle>
          </DialogHeader>
          {obEdit && (
            <div className="space-y-4">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                This will create or update a double-entry opening balance transaction.
                The balance shown for this account will change immediately.
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
                <input
                  type="number" step="0.01"
                  value={obEdit.amount}
                  onChange={e => setObEdit(p => p ? { ...p, amount: e.target.value } : p)}
                  placeholder="e.g. 10000.00 or -4500.00 for a liability"
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={obSaving}
                />
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Positive = asset (funds you hold). Negative = liability (debt owed).
                  Leave blank or 0 to clear.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">As at Date</label>
                <input
                  type="date"
                  value={obEdit.date}
                  onChange={e => setObEdit(p => p ? { ...p, date: e.target.value } : p)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={obSaving}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setObEdit(null)} className="rounded-md border border-border px-4 py-1.5 text-sm" disabled={obSaving}>Cancel</button>
            <button onClick={handleObSave} disabled={obSaving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
              {obSaving ? 'Saving…' : 'Save Opening Balance'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(null) } }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Account' : 'New Account'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {!editing && (
              <div>
                <label className="text-xs text-muted-foreground">Opening Balance</label>
                <input type="number" step="0.01" value={form.openingBalance}
                  onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder="0.00" />
              </div>
            )}
            {!editing && (
              <div>
                <label className="text-xs text-muted-foreground">Opening Balance Date</label>
                <input type="date" value={form.openingBalanceDate}
                  onChange={e => setForm(p => ({ ...p, openingBalanceDate: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            {form.type === 'credit' && (
              <div>
                <label className="text-xs text-muted-foreground">Credit Limit</label>
                <input type="number" step="0.01" value={form.creditLimit}
                  onChange={e => setForm(p => ({ ...p, creditLimit: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
              <ColorPicker
                value={form.color}
                onChange={newColor => setForm(p => ({ ...p, color: newColor }))}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet. Add your first account above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="rounded-lg border border-border p-4 cursor-default"
              onDoubleClick={() => openEdit(a)}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: a.color ?? '#6B7280' }} />
                <span className="font-medium truncate">{a.name}</span>
                {!a.isActive && <span className="text-xs bg-muted px-1.5 rounded">INACTIVE</span>}
              </div>
              {a.institution && <p className="text-xs text-muted-foreground mb-1">{a.institution}</p>}
              <p className="hb-stat__num hb-stat__num--money mb-1">{formatCurrency(a.currentBalance, a.currency)}</p>
              {a.pendingCount > 0 && (
                <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                  <p className="text-amber-500 font-medium">{a.pendingCount} pending transaction{a.pendingCount !== 1 ? 's' : ''}</p>
                  {a.pendingExpense > 0 && <p>-{formatCurrency(a.pendingExpense, a.currency)} uncleared expenses</p>}
                  {a.pendingIncome > 0 && <p>+{formatCurrency(a.pendingIncome, a.currency)} uncleared income</p>}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-muted px-2 py-0.5 rounded-full">{a.type}</span>
                {a.type === 'credit' && a.creditLimit && (
                  <span className="text-muted-foreground">Limit: {formatCurrency(a.creditLimit, a.currency)}</span>
                )}
              </div>
              <div className="flex gap-1 mt-3">
                <button onClick={() => openEdit(a)} title="Edit account" className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                <button
                  onClick={() => openObEdit(a)}
                  title="Set opening balance"
                  className={`p-1 hover:bg-accent rounded text-xs font-medium px-2 py-0.5 rounded-full ${
                    a.openingBalance != null ? 'text-amber-600 bg-amber-500/10' : 'text-muted-foreground'
                  }`}
                >
                  {a.openingBalance != null ? `OB: ${formatCurrency(a.openingBalance)}` : 'Set OB'}
                </button>
                <button onClick={() => handleDelete(a.id)} title="Delete account" className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}