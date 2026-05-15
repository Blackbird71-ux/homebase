'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { todayAU } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Category {
  id: string; name: string; type: string; parentId: string | null
  color: string | null; isPersonal: boolean; isLocationBased: boolean
  isExternal: boolean; isTaxDeduction: boolean
}
export interface Account  { id: string; name: string; type: string }
export interface Member   { id: string; name: string }
export interface Location { id: string; name: string }
export interface Entity   { id: string; name: string; color: string | null; isDefault: boolean }

export interface Transaction {
  id: string; accountId: string | null; categoryId: string | null
  type: string; amount: number; payee: string | null; description: string | null
  date: string; isRecurring: boolean; isCleared: boolean; isPrivate: boolean
  memberId: string | null; locationId: string | null; entityId: string | null
  taxClassification: string | null
  isTransfer: boolean
  category: Category | null; account: Account | null
  member: Member | null
  location: Location | null
  entity: Entity | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTransactionCrud() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts]         = useState<Account[]>([])
  const [categories, setCategories]     = useState<Category[]>([])
  const [members, setMembers]           = useState<Member[]>([])
  const [locations, setLocations]       = useState<Location[]>([])
  const [entities, setEntities]         = useState<Entity[]>([])
  const [loading, setLoading]           = useState(true)
  const [page, setPage]                 = useState(1)
  const [total, setTotal]               = useState(0)
  const [showForm, setShowForm]         = useState(false)
  const [editing, setEditing]           = useState<Transaction | null>(null)
  const [filterType, setFilterType]         = useState('')
  const [filterMemberId, setFilterMemberId] = useState('')
  const [filterLocationId, setFilterLocationId] = useState('')
  const [filterEntityId, setFilterEntityId]     = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [form, setForm] = useState({
    accountId: '', categoryId: '', type: 'expense', amount: 0,
    payee: '', description: '', date: todayAU(),
    isCleared: false, isPrivate: false, memberId: '', locationId: '', entityId: '',
    taxClassification: '', isTransfer: false, glAccountId: '',
  })
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [fetchError, setFetchError] = useState<string | null>(null)

  const limit = 50

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (filterType)       params.set('type', filterType)
      if (filterMemberId)   params.set('memberId', filterMemberId)
      if (filterLocationId) params.set('locationId', filterLocationId)
      if (filterEntityId)   params.set('entityId', filterEntityId)
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setTransactions(d.transactions.map((t: any) => ({
          ...t,
          member: t.memberId ? (members.find((m: Member) => m.id === t.memberId) ?? null) : null,
        })))
        setTotal(d.total)
      } else {
        setFetchError(`Failed to load (HTTP ${res.status})`)
      }
    } catch (err: any) {
      setFetchError(err.message ?? 'Network error')
      console.error('[transactions] load error:', err)
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const res = await fetch('/api/finance/references')
    if (res.ok) {
      const { accounts, categories, members, locations, entities } = await res.json()
      setAccounts(accounts)
      setCategories(categories)
      setMembers(members)
      setLocations(locations)
      setEntities(entities)
    }
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { load() }, [page, filterType, filterMemberId, filterLocationId, filterEntityId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / limit)

  // ── Form open/close ──────────────────────────────────────────────────────────

  const emptyForm = {
    accountId: '', categoryId: '', type: 'expense', amount: 0,
    payee: '', description: '', date: todayAU(),
    isCleared: false, isPrivate: false, memberId: '', locationId: '', entityId: '',
    taxClassification: '', isTransfer: false, glAccountId: '',
  }

  function openNew() {
    setEditing(null)
    setErrors({})
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(t: Transaction) {
    if (t.type === 'opening_balance') {
      toast.info('Opening balance transactions are managed via the Accounts page.')
      return
    }
    setEditing(t)
    setErrors({})
    setForm({
      accountId: t.accountId ?? '', categoryId: t.categoryId ?? '', type: t.type,
      amount: t.amount, payee: t.payee ?? '', description: t.description ?? '',
      date: t.date.split('T')[0], isCleared: t.isCleared, isPrivate: t.isPrivate,
      memberId: t.memberId ?? '', locationId: t.location?.id ?? '', entityId: t.entityId ?? '',
      taxClassification: t.taxClassification ?? '', isTransfer: t.isTransfer ?? false,
      glAccountId: (t as any).glAccountId ?? '',
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setErrors({}) }

  // ── Validation ───────────────────────────────────────────────────────────────

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.amount || form.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.type) errs.type = 'Type is required'
    return errs
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const body = editing
      ? { id: editing.id, ...form, accountId: form.accountId || null, categoryId: form.categoryId || null, memberId: form.memberId || null, locationId: form.locationId || null, entityId: form.entityId || null, taxClassification: form.taxClassification || null, isTransfer: form.isTransfer, glAccountId: form.glAccountId || null }
      : { ...form, accountId: form.accountId || null, categoryId: form.categoryId || null, memberId: form.memberId || null, locationId: form.locationId || null, entityId: form.entityId || null, taxClassification: form.taxClassification || null, isTransfer: form.isTransfer, glAccountId: form.glAccountId || null }
    const res = await fetch('/api/finance/transactions', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Transaction updated' : 'Transaction created'); closeForm(); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return
    const res = await fetch(`/api/finance/transactions?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Transaction deleted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  return {
    // State
    transactions, loading, showForm, editing,
    form, setForm, errors,
    fetchError,
    // Reference data
    accounts, categories, members, locations, entities,
    // Pagination
    page, setPage, total, totalPages,
    // Filters
    filterType, setFilterType,
    filterMemberId, setFilterMemberId,
    filterLocationId, setFilterLocationId,
    filterEntityId, setFilterEntityId,
    showFilters, setShowFilters,
    // Actions
    load, openNew, openEdit, closeForm, handleSave, handleDelete,
  }
}
