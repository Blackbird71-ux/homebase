'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatInTz } from '@/lib/timezone'
import { todayAU } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TBAccount {
  id: string
  name: string
  type: string
  glCode: string | null
  parentId: string | null
  parentName: string | null
  totalDebit: number
  totalCredit: number
  netBalance: number
}

export interface TrialBalanceData {
  mode: 'trial-balance'
  accounts: TBAccount[]
  grandTotalDebit: number
  grandTotalCredit: number
  isBalanced: boolean
  difference: number
  from: string | null
  to: string | null
}

export interface GLLine {
  id: string
  date: string
  reference: string
  description: string
  type: 'journal' | 'transaction'
  entryType: string
  debit: number
  credit: number
  movement: number
  balance: number
  lineDescription: string | null
}

export interface GLAccount {
  id: string
  name: string
  type: string
  glCode: string | null
  parentName: string | null
  openingBalance: number
}

export interface GeneralLedgerData {
  mode: 'general-ledger'
  glAccount: GLAccount
  openingBalance: number
  closingBalance: number
  totalDebit: number
  totalCredit: number
  lines: GLLine[]
  from: string | null
  to: string | null
}

export type TrialBalancePageData = TrialBalanceData | GeneralLedgerData | null

// ── Internal constant ─────────────────────────────────────────────────────────

const TYPE_ORDER: Record<string, number> = {
  asset: 1, liability: 2, equity: 3, income: 4, expense: 5, transfer: 6,
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTrialBalance() {
  const [data, setData]         = useState<TrialBalancePageData>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState(todayAU())
  const [entityId, setEntityId] = useState('')
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch]     = useState('')
  const [glAccountId, setGlAccountId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/finance/entities')
      .then(r => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => {})
  }, [])

  const load = useCallback(async (glId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from)     params.set('from', from)
      if (to)       params.set('to', to)
      if (entityId) params.set('entityId', entityId)
      if (glId)     params.set('glAccountId', glId)

      const res = await fetch(`/api/finance/trial-balance?${params}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError(e.error ?? 'Failed to load')
        return
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }, [from, to, entityId])

  useEffect(() => { load(glAccountId ?? undefined) }, [load, glAccountId])

  function drillInto(accountId: string) {
    setGlAccountId(accountId)
    setSearch('')
  }

  function backToTrialBalance() {
    setGlAccountId(null)
  }

  function groupAccounts(accounts: TBAccount[]) {
    const groups = new Map<string, TBAccount[]>()
    const order  = ['asset', 'liability', 'equity', 'income', 'expense', 'transfer']
    for (const type of order) groups.set(type, [])
    for (const acct of accounts) {
      const key = acct.type in TYPE_ORDER ? acct.type : 'transfer'
      groups.get(key)?.push(acct)
    }
    return groups
  }

  // Derived state
  const filteredAccounts = data?.mode === 'trial-balance'
    ? data.accounts.filter(a =>
        !search || a.name.toLowerCase().includes(search.toLowerCase())
          || (a.glCode ?? '').toLowerCase().includes(search.toLowerCase())
          || (a.parentName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : []

  const tbData  = data?.mode === 'trial-balance'   ? data : null
  const glData  = data?.mode === 'general-ledger'  ? data : null
  const grouped = tbData ? groupAccounts(filteredAccounts) : null

  const printDateRange = data?.from && data?.to
    ? `${formatInTz(new Date(data.from), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatInTz(new Date(data.to), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : data?.to ? `Up to ${formatInTz(new Date(data.to), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'All time'

  const printTitle = glAccountId
    ? `General Ledger${glData ? ` — ${glData.glAccount.name}` : ''}`
    : 'Trial Balance'

  return {
    // State
    data, loading, error,
    from, setFrom,
    to, setTo,
    entityId, setEntityId,
    entities,
    search, setSearch,
    glAccountId,
    // Derived
    filteredAccounts, tbData, glData, grouped,
    printDateRange, printTitle,
    // Actions
    load, drillInto, backToTrialBalance,
  }
}
