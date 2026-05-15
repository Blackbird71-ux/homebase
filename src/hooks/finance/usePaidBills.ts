'use client'

/**
 * usePaidBills
 *
 * All state and actions for the Paid Bills page — extracted to keep the page
 * component lean and consistent with the codebase pattern.
 *
 * Reuses:
 *   - usePaymentHistory for the per-bill payment panel (add / undo installments)
 *   - Bill type from useBillCrud
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { subMonths } from 'date-fns'
import { usePaymentHistory } from '@/hooks/finance/usePaymentHistory'
import type { Bill } from '@/hooks/finance/useBillCrud'

export type { Bill } from '@/hooks/finance/useBillCrud'

interface Category {
  id: string
  name: string
  type: string
  parentId: string | null
}

interface GLAccount {
  id: string
  name: string
  type: string
  parentId: string | null
}

export function usePaidBills() {
  const [bills, setBills]           = useState<Bill[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [glAccounts, setGLAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading]       = useState(true)
  const [hideDeleteBills, setHideDeleteBills] = useState(false)

  // Confirmation dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidConfirm, setVoidConfirm]     = useState<{ id: string; name: string } | null>(null)
  const [voidNote, setVoidNote]           = useState('')

  // Filter state — persisted in sessionStorage
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

  // Payment history panel — same hook as active bills page
  const paymentHistory = usePaymentHistory(() => load())

  // ── Data loading ────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    try {
      const [billsRes, catsRes, glRes, sRes] = await Promise.all([
        fetch('/api/finance/bills'),
        fetch('/api/finance/categories'),
        fetch('/api/finance/categories?forPicker=true'),
        fetch('/api/settings'),
      ])
      if (billsRes.ok) {
        const all: Bill[] = await billsRes.json()
        setBills(all.filter(b => b.paid))
      }
      if (catsRes.ok) setCategories(await catsRes.json())
      if (glRes.ok) {
        const glCats = await glRes.json()
        setGLAccounts(glCats.filter((c: any) => c.type !== 'transfer'))
      }
      if (sRes.ok) {
        const settings = await sRes.json()
        setHideDeleteBills(settings.uiPreferences?.hideDeleteBills === true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter helpers ───────────────────────────────────────────────────────────

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

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleUndoPaid(id: string) {
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paid: false }),
    })
    if (res.ok) { toast.success('Payment reversed — bill restored to active'); load() }
    else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to undo payment')
    }
  }

  function handleDelete(id: string, name: string) {
    setDeleteConfirm({ id, name })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const res = await fetch(`/api/finance/bills?id=${deleteConfirm.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Bill deleted')
      setDeleteConfirm(null)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to delete')
    }
  }

  function handleVoid(id: string, name: string) {
    setVoidNote('')
    setVoidConfirm({ id, name })
  }

  async function confirmVoid() {
    if (!voidConfirm) return
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: voidConfirm.id, void: true, voidNote: voidNote || null }),
    })
    if (res.ok) {
      toast.success('Bill voided — GL reversal journals created')
      setVoidConfirm(null)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to void')
    }
  }

  // ── Derived list data ────────────────────────────────────────────────────────

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId && c.type === 'expense')

  const today        = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const cutoff       = subMonths(todayMidnight, monthRange)

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

  const colCats  = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal = sorted.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = sorted.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }
  // Icon col + name col + category cols + amount col + actions col
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 8rem 10rem`

  return {
    // Data
    loading,
    sorted,
    categories,
    glAccounts,
    hideDeleteBills,
    // Filter state
    monthRange, setMonthRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    rootCategories,
    // Derived
    colCats, grandTotal, catTotals, gridTemplate,
    // Confirmation dialogs
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    // Actions
    handleUndoPaid,
    handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    billAmountForCat,
    // Payment history panel
    paymentHistory,
  }
}
