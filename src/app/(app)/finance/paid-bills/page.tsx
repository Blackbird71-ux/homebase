'use client'

import { useEffect, useState } from 'react'
import { Undo2, CheckCircle2, RotateCcw, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { format, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Bill } from '@/app/(app)/finance/bills/page'

export default function PaidBillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [monthRange, setMonthRange] = useState<1 | 3 | 6 | 12>(3)
  const [selectedRootCategory, setSelectedRootCategory] = useState<string>('')
  const [selectedMember, setSelectedMember] = useState<string>('')

  async function load() {
    setLoading(true)
    try {
      const [billsRes, catsRes, membersRes] = await Promise.all([
        fetch('/api/finance/bills'),
        fetch('/api/finance/categories'),
        fetch('/api/finance/members'),
      ])
      if (billsRes.ok) setBills((await billsRes.json()).filter((b: Bill) => b.paid))
      if (catsRes.ok) setCategories(await catsRes.json())
      if (membersRes.ok) setMembers(await membersRes.json())
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleUndoPaid(id: string) {
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paid: false }),
    })
    if (res.ok) { toast.success('Payment undone'); load() }
    else toast.error('Failed to undo payment')
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const cutoff = subMonths(new Date(), monthRange)

  const filtered = bills.filter(b => {
    if (b.paidDate && new Date(b.paidDate) < cutoff) return false
    if (selectedRootCategory) {
      const billCat = categories.find(c => c.id === b.category?.id)
      if (!billCat) return false
      if (billCat.id !== selectedRootCategory && billCat.parentId !== selectedRootCategory) return false
    }
    if (selectedMember) {
      if (selectedMember === 'household') { if (b.memberId) return false }
      else { if (b.memberId !== selectedMember) return false }
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.paidDate && b.paidDate) return new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime()
    if (a.paidDate) return -1
    if (b.paidDate) return 1
    return 0
  })

  const total = sorted.reduce((s, b) => s + b.amount, 0)

  if (loading) return <div className="p-4 text-muted-foreground">Loading paid bills…</div>

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paid Bills</h1>
        <Link href="/finance/bills" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Active Bills
        </Link>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {([1, 3, 6, 12] as const).map(m => (
            <button key={m} onClick={() => setMonthRange(m)}
              className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
                monthRange === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m === 1 ? '1 Month' : `${m} Months`}
            </button>
          ))}
        </div>

        {rootCategories.length > 0 && (
          <select value={selectedRootCategory} onChange={e => setSelectedRootCategory(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs">
            <option value="">All Categories</option>
            {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {members.length > 0 && (
          <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs">
            <option value="">All Members</option>
            <option value="household">Household (shared)</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid bills in this period.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(bill => {
            const isOneOff = bill.billType === 'one-off'
            return (
              <div key={bill.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50">
                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{bill.name}</span>
                    {isOneOff && <span className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 rounded">ONE-OFF</span>}
                    {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
                    {bill.invoiceReceived && (
                      <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 rounded flex items-center gap-0.5">
                        <Receipt className="h-2.5 w-2.5" /> INVOICE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {bill.paidDate && (
                      <span className="text-green-500">Paid {format(new Date(bill.paidDate), 'd MMM yyyy')}</span>
                    )}
                    {bill.category && (
                      <span className="inline-flex items-center gap-1">
                        {bill.category.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bill.category.color }} />}
                        {bill.category.name}
                      </span>
                    )}
                    <span className="capitalize">{bill.frequency}</span>
                    {bill.account && <span>{bill.account.name}</span>}
                    {bill.member && <span className="text-primary">{bill.member.name}</span>}
                    {bill.location && <span>{bill.location.name}</span>}
                  </div>
                </div>

                <p className="text-sm font-semibold text-muted-foreground shrink-0">
                  {formatCurrency(bill.amount)}
                </p>

                <button onClick={() => handleUndoPaid(bill.id)} title="Undo paid"
                  className="p-1 hover:bg-accent rounded text-green-500 shrink-0">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Totals bar ─────────────────────────────────────────────────── */}
      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {sorted.length} bill{sorted.length !== 1 ? 's' : ''} paid in last {monthRange === 1 ? '1 month' : `${monthRange} months`}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-muted-foreground font-medium">Total paid:</span>
            <span className="font-bold text-green-600">{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
