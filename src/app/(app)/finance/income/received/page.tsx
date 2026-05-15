'use client'

import { useEffect, useState } from 'react'
import { Undo2, CheckCircle2, RotateCcw, Settings2, RefreshCw, Layers, Ban, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { IncomeEntry } from '@/app/(app)/finance/income/page'

export default function ReceivedIncomePage() {
  const [entries, setEntries] = useState<IncomeEntry[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [hideDeleteBills, setHideDeleteBills] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidConfirm, setVoidConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [monthRange, setMonthRange] = useState<1 | 3 | 6 | 12>(() => {
    if (typeof window !== 'undefined') {
      const saved = parseInt(sessionStorage.getItem('income-received-monthRange') ?? '')
      if (saved === 1 || saved === 3 || saved === 6 || saved === 12) return saved as 1 | 3 | 6 | 12
    }
    return 3
  })
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('income-received-selectedCatIds')
        if (saved) return JSON.parse(saved) as string[]
      } catch {}
    }
    return []
  })
  const [showCatPicker, setShowCatPicker] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [entriesRes, catsRes, sRes] = await Promise.all([
        fetch('/api/finance/income/received'),
        fetch('/api/finance/categories'),
        fetch('/api/settings'),
      ])
      if (entriesRes.ok) setEntries(await entriesRes.json())
      if (catsRes.ok) setCategories(await catsRes.json())
      if (sRes.ok) {
        const settings = await sRes.json()
        setHideDeleteBills(!!settings.uiPreferences?.hideDeleteBills)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function setMonthRangePersisted(m: 1 | 3 | 6 | 12) {
    sessionStorage.setItem('income-received-monthRange', String(m))
    setMonthRange(m)
  }

  function toggleCat(id: string) {
    setSelectedCatIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      sessionStorage.setItem('income-received-selectedCatIds', JSON.stringify(next))
      return next
    })
  }

  async function handleUndoReceived(id: string) {
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, received: false }),
    })
    if (res.ok) { toast.success('Income receipt undone'); load() }
    else toast.error('Failed to undo receipt')
  }

  function handleDelete(id: string, name: string) { setDeleteConfirm({ id, name }) }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const res = await fetch(`/api/finance/income?id=${deleteConfirm.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Income deleted'); setDeleteConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  function handleVoid(id: string, name: string) { setVoidNote(''); setVoidConfirm({ id, name }) }

  async function confirmVoid() {
    if (!voidConfirm) return
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: voidConfirm.id, void: true, voidNote }),
    })
    if (res.ok) { toast.success('Income voided'); setVoidConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to void') }
  }

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
  }

  function entryAmountForCat(entry: IncomeEntry, rootCatId: string): number {
    if (!entry.category) return 0
    const cat = categories.find(c => c.id === entry.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return entry.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const today = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const cutoff = subMonths(todayMidnight, monthRange)

  const sorted = [...entries]
    .filter(e => {
      if (!e.receivedDate) return true
      const pd = new Date(e.receivedDate)
      const pdMidnight = new Date(pd.getFullYear(), pd.getMonth(), pd.getDate())
      return pdMidnight >= cutoff
    })
    .sort((a, b) => {
      if (a.receivedDate && b.receivedDate) return new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime()
      if (a.receivedDate) return -1
      if (b.receivedDate) return 1
      return 0
    })

  const colCats = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal = sorted.reduce((s, e) => s + e.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = sorted.reduce((s, e) => s + entryAmountForCat(e, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 6.5rem 5rem`

  if (loading) return <div className="p-4 text-muted-foreground">Loading received income…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Received Income</h1>
        <Link href="/finance/income" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Active Income
        </Link>
      </div>

      <Dialog open={!!voidConfirm} onOpenChange={open => { if (!open) setVoidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-amber-500" /> Void Income Entry</DialogTitle></DialogHeader>
          {voidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Void <span className="font-medium text-foreground">{voidConfirm.name}</span>? This will create reversal journal entries and mark the income as voided. The record is kept for audit purposes.
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Void reason (optional)</label>
                <input value={voidNote} onChange={e => setVoidNote(e.target.value)}
                  placeholder="e.g. Cancelled, entered in error…"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setVoidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmVoid} className="rounded-md bg-amber-500 text-white px-4 py-1.5 text-sm font-medium">Void Entry</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-4 w-4" /> Delete Income Entry</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div className="space-y-2 py-1">
              <p className="text-sm text-muted-foreground">
                Permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>? All related journal entries and transactions will be removed. This cannot be undone.
              </p>
              <p className="text-xs text-amber-600 font-medium">Consider using Void instead to preserve the audit trail.</p>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setDeleteConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmDelete} className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium">Delete Permanently</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {([1, 3, 6, 12] as const).map(m => (
            <button key={m} onClick={() => setMonthRangePersisted(m)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                monthRange === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {m === 1 ? '1 Month' : `${m} Months`}
            </button>
          ))}
        </div>

        {rootCategories.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowCatPicker(p => !p)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCatIds.length > 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              <Settings2 className="h-3.5 w-3.5" />
              {selectedCatIds.length > 0 ? `${selectedCatIds.length} categor${selectedCatIds.length === 1 ? 'y' : 'ies'} shown` : 'Show category columns'}
            </button>
            {showCatPicker && (
              <div className="absolute left-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover shadow-md p-3 space-y-1.5 min-w-[180px]">
                <p className="text-xs text-muted-foreground font-medium mb-2">Show as columns:</p>
                {rootCategories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedCatIds.includes(c.id)} onChange={() => toggleCat(c.id)}
                      className="rounded border-input" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No received income in this period.</p>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          {colCats.length > 0 && (
            <div className="grid gap-3 px-3 pb-1" style={{ gridTemplateColumns: gridTemplate, alignItems: 'end' }}>
              <div />
              <div />
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-medium text-muted-foreground text-right leading-tight">{c.name}</span>
              ))}
              <span className="text-xs font-medium text-muted-foreground text-right">Total</span>
              <div />
            </div>
          )}

          {sorted.map(entry => (
            <div key={entry.id} className="grid gap-3 rounded-lg border border-border p-3 hover:bg-accent/50"
                 style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
              <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.name}</span>
                  {entry.incomeType !== 'one-off'
                    ? <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 rounded flex items-center gap-0.5"><RefreshCw className="h-2.5 w-2.5" /> Recurring</span>
                    : <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 rounded flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" /> One-off</span>
                  }
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {entry.receivedDate && <span className="text-green-500">Received {format(new Date(entry.receivedDate), 'd MMM yyyy')}</span>}
                  {entry.category && (
                    <span className="inline-flex items-center gap-1">
                      {entry.category.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.category.color }} />}
                      {entry.category.name}
                    </span>
                  )}
                  <span className="capitalize">{entry.incomeType !== 'one-off' ? entry.frequency : 'One-off'}</span>
                  {entry.account && <span>{entry.account.name}</span>}
                  {entry.member && <span className="text-primary">{entry.member.name}</span>}
                  {entry.location && <span>{entry.location.name}</span>}
                </div>
              </div>
              {colCats.map(c => {
                const amt = entryAmountForCat(entry, c.id)
                return (
                  <span key={c.id} className="text-sm text-right text-muted-foreground">
                    {amt > 0 ? formatCurrency(amt) : '—'}
                  </span>
                )
              })}
              <p className="text-sm font-semibold text-muted-foreground text-right">
                {formatCurrency(entry.amount)}
              </p>
              <div className="flex items-center gap-0.5 justify-end">
                <button onClick={() => handleUndoReceived(entry.id)}
                  title={entry.incomeType !== 'one-off' ? 'Undo receipt (removes the next scheduled occurrence)' : 'Undo receipt'}
                  className="p-1 hover:bg-accent rounded text-green-500">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleVoid(entry.id, entry.name)} title="Void"
                  className="p-1 hover:bg-accent rounded text-amber-500">
                  <Ban className="h-3.5 w-3.5" />
                </button>
                {!hideDeleteBills && (
                  <button onClick={() => handleDelete(entry.id, entry.name)} title="Delete"
                    className="p-1 hover:bg-accent rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Totals row */}
          <div className="grid gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1"
               style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
            <div />
            <div className="text-xs font-semibold text-muted-foreground">
              {sorted.length} income entr{sorted.length !== 1 ? 'ies' : 'y'} — last {monthRange === 1 ? '1 month' : `${monthRange} months`}
            </div>
            {colCats.map(c => (
              <span key={c.id} className="text-xs font-semibold text-right">
                {catTotals[c.id] > 0 ? formatCurrency(catTotals[c.id]) : <span className="text-muted-foreground">—</span>}
              </span>
            ))}
            <span className="text-sm font-bold text-green-600 text-right">{formatCurrency(grandTotal)}</span>
            <div />
          </div>
        </div>
      )}
    </div>
  )
}
