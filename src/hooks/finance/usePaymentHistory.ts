'use client'

/**
 * usePaymentHistory
 *
 * Manages payment history panel state and all payment actions for a single
 * open bill panel. Handles: load, add payment (with GL journal), undo payment
 * (with GL reversal). Extracted from useBillCrud to keep pages lean.
 *
 * GL-first: all writes go through /api/finance/bills/[id]/payments which
 * posts correct journal entries (paths A–D) and the DELETE endpoint which
 * reverses them. This hook is UI-only — no GL logic here.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { todayAU } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillPayment {
  id: string
  amount: number
  paymentDate: string
  notes: string | null
  glAccount: { id: string; name: string; color: string | null; type: string } | null
  account:   { id: string; name: string } | null
  transaction: { id: string; amount: number; date: string; isCleared: boolean } | null
}

export interface AddPaymentForm {
  amount: string
  paymentDate: string
  accountId: string
  notes: string
}

function emptyAddForm(): AddPaymentForm {
  return { amount: '', paymentDate: todayAU(), accountId: '', notes: '' }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaymentHistory(onRefresh: () => void) {
  // Which bill's panel is currently open (null = all closed)
  const [openBillId, setOpenBillId]     = useState<string | null>(null)
  const [payments, setPayments]         = useState<BillPayment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Inline add-payment form
  const [showAddForm, setShowAddForm]   = useState(false)
  const [addForm, setAddForm]           = useState<AddPaymentForm>(emptyAddForm())
  const [addingPayment, setAddingPayment] = useState(false)

  // Per-payment undo in-flight tracking
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  // ── Load payments for a bill ────────────────────────────────────────────────

  const loadPayments = useCallback(async (billId: string) => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/finance/bills/${billId}/payments`)
      if (res.ok) {
        setPayments(await res.json())
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to load payment history')
      }
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // ── Open / close panel ──────────────────────────────────────────────────────

  function openPanel(billId: string) {
    // Toggle: clicking same bill again closes the panel
    if (openBillId === billId) {
      closePanel()
      return
    }
    setOpenBillId(billId)
    setPayments([])
    setShowAddForm(false)
    setAddForm(emptyAddForm())
    loadPayments(billId)
  }

  function closePanel() {
    setOpenBillId(null)
    setPayments([])
    setShowAddForm(false)
    setAddForm(emptyAddForm())
  }

  // ── Add payment form ────────────────────────────────────────────────────────

  function openAddForm(billAmount: number, totalPaidSoFar: number, defaultAccountId?: string) {
    const remaining = Math.max(0, billAmount - totalPaidSoFar)
    setAddForm({
      ...emptyAddForm(),
      amount: remaining > 0 ? remaining.toFixed(2) : '',
      // Preselect the account the bill is configured to be paid from (Xero 1:1
      // model) so the cash side posts to the right ledger account by default.
      accountId: defaultAccountId ?? '',
    })
    setShowAddForm(true)
  }

  function cancelAddForm() {
    setShowAddForm(false)
    setAddForm(emptyAddForm())
  }

  async function submitAddPayment(billId: string) {
    const amount = parseFloat(addForm.amount)
    if (!amount || amount <= 0) {
      toast.error('Payment amount must be greater than 0')
      return
    }
    if (!addForm.paymentDate) {
      toast.error('Payment date is required')
      return
    }

    setAddingPayment(true)
    try {
      const res = await fetch(`/api/finance/bills/${billId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentDate: addForm.paymentDate,
          accountId:   addForm.accountId || undefined,
          notes:       addForm.notes     || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? `Failed to record payment (${res.status})`)
        return
      }

      // Surface suspense/spawn warnings from the API — not errors, just FYI
      if (data.glWarning) toast.warning(data.glWarning)

      toast.success('Payment recorded')
      setShowAddForm(false)
      setAddForm(emptyAddForm())
      // Reload payment list then refresh parent bill list so paid/partial badge updates
      await loadPayments(billId)
      onRefresh()
    } finally {
      setAddingPayment(false)
    }
  }

  // ── Undo (delete) a single payment ─────────────────────────────────────────
  // The API DELETE reverses the GL journal entry — this hook just calls it.

  async function deletePayment(billId: string, paymentId: string) {
    if (!confirm('Undo this payment? The GL journal entry will be reversed and the bill re-opened.')) return

    setDeletingPaymentId(paymentId)
    try {
      const res = await fetch(
        `/api/finance/bills/${billId}/payments/${paymentId}`,
        { method: 'DELETE' },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to undo payment')
        return
      }

      toast.success('Payment reversed — GL journal updated')
      await loadPayments(billId)
      onRefresh()
    } finally {
      setDeletingPaymentId(null)
    }
  }

  // ── Exposed API ─────────────────────────────────────────────────────────────

  return {
    // Panel state
    openBillId,
    payments,
    loadingHistory,
    // Add form state
    showAddForm,
    addForm,
    setAddForm,
    addingPayment,
    // Undo state
    deletingPaymentId,
    // Actions
    openPanel,
    closePanel,
    openAddForm,
    cancelAddForm,
    submitAddPayment,
    deletePayment,
  }
}
