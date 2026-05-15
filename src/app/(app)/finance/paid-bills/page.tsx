'use client'

import { useEffect, useState } from 'react'
import { Undo2, CheckCircle2, RotateCcw, Settings2, RefreshCw, Layers, Trash2, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { format, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Bill } from '@/app/(app)/finance/bills/page'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export default function PaidBillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [hideDeleteBills, setHideDeleteBills] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidConfirm, setVoidConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [monthRange, setMonthRange] = useState<1 | 3 | 6 | 12>(() => {
    if (typeof window !== 'undefined') {
      const saved = parseInt(sessionStorage.getItem('paid-bills-monthRange') ?? '')
      if (saved === 1 || saved === 3 || saved === 6 || saved === 12) return saved as 1 | 3 | 6 | 12
    }
    return 3
  })
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('paid-bills-selectedCatIds')
        if (saved) return JSON.parse(saved) as string[]
      } catch {}
    }
    return []
  })
  const [showCatPicker, setShowCatPicker] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [billsRes, catsRes, sRes] = await Promise.all([
        fetch('/api/finance/bills'),
        fetch('/api/finance/categories'),
        fetch('/api/settings'),
      ])
      if (billsRes.ok) setBills((await billsRes.json()).filter((b: Bill) => b.paid))
      if (catsRes.ok) setCategories(await catsRes.json())
      if (sRes.ok) {
        const settings = await sRes.json()
        setHideDeleteBills(settings.uiPreferences?.hideDeleteBills === true)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function setMonthRangePersisted(m: 1 | 3 | 6 | 12) {
    sessionStorage.setItem('paid-bills-monthRange', String(m))
    setMonthRange(m)
  }

  function toggleCat(id: string) {
    setSelectedCatIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      sessionStorage.setItem('paid-bills-selectedCatIds', JSON.stringify(next))
      return next
    })
  }

  async function handleUndoPaid(id: string) {
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paid: false }),
    })
    if (res.ok) { toast.success('Payment undone'); load() }
    else toast.error('Failed to undo payment')
  }

  function handleDelete(id: string, name: string) {
    setDeleteConfirm({ id, name })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const res = await fetch(`/api/finance/bills?id=${deleteConfirm.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bill deleted'); setDeleteConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  function handleVoid(id: string, name: string) {
    setVoidNote('')
    setVoidConfirm({ id, name })
  }

  async function confirmVoid() {
    if (!voidConfirm) return
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: voidConfirm.id, void: true, voidNote: voidNote || null }),
    })
    if (res.ok) { toast.success('Bill voided — GL reversal journals created'); setVoidConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to void') }
  }

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
  }

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const today = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const cutoff = subMonths(todayMidnight, monthRange)

  const sorted = [...bills]
    .filter(b => {
      if (!b.paidDate) return true
      const pd = new Date(b.paidDate)
      const pdMidnight = new Date(pd.getFullYear(), pd.getMonth(), pd.getDate())
      return pdMidnight >= cutoff
    })
    .sort((a, b) => {
      if (a.paidDate && b.paidDate) return new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime()
      if (a.paidDate) return -1
      if (b.paidDate) return 1
      return 0
    })

  const colCats = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal = sorted.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = sorted.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 6.5rem 5rem`

  if (loading) return <div className="p-4 text-muted-foreground">Loading paid bills…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paid Bills</h1>
        <Link href="/finance/bills" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Active Bills
        </Link>
      </div>

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

      {/* Void confirmation dialog */}
      <Dialog open={!!voidConfirm} onOpenChange={open => { if (!open) setVoidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-amber-500" /> Void bill</DialogTitle></DialogHeader>
          {voidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Void <span className="font-medium text-foreground">{voidConfirm.name}</span>?
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">What void does (accountant-approved):</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Creates reversal journal entries in the GL</li>
                  <li>The bill and all journals are kept for audit trail</li>
                  <li>The bill will no longer appear in active lists or reports</li>
                </ul>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason for void (optional)</label>
                <input value={voidNote} onChange={e => setVoidNote(e.target.value)} placeholder="e.g. Entered in error"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setVoidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmVoid} className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-sm font-medium">Void bill</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-red-500" /> Delete bill</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>?
              </p>
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 space-y-1">
                <p className="font-medium">Warning — this cannot be undone:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>GL journal entries will be reversed</li>
                  <li>Associated transactions will be permanently deleted</li>
                  <li>No audit trail is kept</li>
                  <li>Consider using <span className="font-medium">Void</span> instead for a proper audit trail</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setDeleteConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmDelete} className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium">Delete permanently</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid bills in this period.</p>
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

          {sorted.map(bill => (
            <div key={bill.id} className="grid gap-3 rounded-lg border border-border p-3 hover:bg-accent/50"
                 style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
              <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{bill.name}</span>
                  {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
                  {bill.billType !== 'one-off'
                    ? <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 rounded flex items-center gap-0.5"><RefreshCw className="h-2.5 w-2.5" /> Recurring</span>
                    : <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 rounded flex items-center gap-0.5"><Layers className="h-2.5 w-2.5" /> One-off</span>
                  }
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {bill.paidDate && <span className="text-green-500">Paid {format(new Date(bill.paidDate), 'd MMM yyyy')}</span>}
                  {bill.payments && bill.payments.length > 1 && (
                    <span className="text-muted-foreground">{bill.payments.length} installments</span>
                  )}
                  {bill.category && (
                    <span className="inline-flex items-center gap-1">
                      {bill.category.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bill.category.color }} />}
                      {bill.category.name}
                    </span>
                  )}
                  <span className="capitalize">{bill.billType !== 'one-off' ? bill.frequency : 'One-off'}</span>
                  {bill.account && <span>{bill.account.name}</span>}
                  {bill.member && <span className="text-primary">{bill.member.name}</span>}
                  {bill.location && <span>{bill.location.name}</span>}
                </div>
              </div>
              {colCats.map(c => {
                const amt = billAmountForCat(bill, c.id)
                return (
                  <span key={c.id} className="text-sm text-right text-muted-foreground">
                    {amt > 0 ? formatCurrency(amt) : '—'}
                  </span>
                )
              })}
              <p className="text-sm font-semibold text-muted-foreground text-right">
                {formatCurrency(bill.amount)}
              </p>
              <div className="flex items-center gap-0.5 justify-end">
                <button onClick={() => handleUndoPaid(bill.id)}
                  title={bill.billType !== 'one-off' ? 'Undo payment (removes the next scheduled occurrence)' : 'Undo payment'}
                  className="p-1 hover:bg-accent rounded text-green-500">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleVoid(bill.id, bill.name)}
                  title="Void (accountant-safe — creates reversal journals, keeps audit trail)"
                  className="p-1 hover:bg-accent rounded text-amber-500">
                  <Ban className="h-3.5 w-3.5" />
                </button>
                {!hideDeleteBills && (
                  <button onClick={() => handleDelete(bill.id, bill.name)}
                    title="Delete permanently (no audit trail)"
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
              {sorted.length} bill{sorted.length !== 1 ? 's' : ''} — last {monthRange === 1 ? '1 month' : `${monthRange} months`}
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
