'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { todayAU } from '@/lib/utils'
import {
  type FormState, type TemplateRow, type ContactRow, type AccountRow,
  type CategoryRow, type EntityRow, type MemberRow, type LocationRow, type Tab,
  emptyForm, loadTemplateDefaults, saveTemplateDefaults,
  templateToForm, formToBody, validate,
} from '@/lib/finance-template-helpers'
import type { GLAccount } from '@/components/finance/JournalLinesEditor'

export function useTemplatesCrud() {
  const [templates, setTemplates]   = useState<TemplateRow[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [contacts, setContacts]     = useState<ContactRow[]>([])
  const [accounts, setAccounts]     = useState<AccountRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [entities, setEntities]     = useState<EntityRow[]>([])
  const [members, setMembers]       = useState<MemberRow[]>([])
  const [locations, setLocations]   = useState<LocationRow[]>([])

  const [form, setForm]       = useState<FormState>(emptyForm)
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [tab, setTab]         = useState<Tab>('Overview')
  const [saving, setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null)

  async function load() {
    const res = await fetch('/api/finance/templates?includeDisabled=true')
    if (res.ok) setTemplates(await res.json())
  }

  async function loadRefs() {
    const [aRes, catRes, conRes, entRes, memRes, locRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/contacts'),
      fetch('/api/finance/entities'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
    ])
    if (aRes.ok)   setAccounts(await aRes.json())
    if (catRes.ok) {
      const cats = await catRes.json()
      setCategories(cats)
      setGlAccounts(cats)
    }
    if (conRes.ok) setContacts(await conRes.json())
    if (entRes.ok) setEntities(await entRes.json())
    if (memRes.ok) setMembers(await memRes.json())
    if (locRes.ok) setLocations(await locRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (glAccounts.length > 0) load() }, [glAccounts])

  function openCreate(kind: 'bill' | 'income' = 'bill') {
    const saved = loadTemplateDefaults()

    // Auto-detect Accounts Payable (bill) or Accounts Receivable (income)
    // by matching the canonical name in the chart of accounts.
    const apAccount = glAccounts.find(a =>
      a.type === 'liability' &&
      (a.name.toLowerCase().includes('accounts payable') || a.name.toLowerCase().includes('account payable'))
    )
    const arAccount = glAccounts.find(a =>
      a.type === 'asset' &&
      (a.name.toLowerCase().includes('accounts receivable') || a.name.toLowerCase().includes('account receivable'))
    )

    // Build default journal lines with the appropriate offsetting GL account pre-filled
    const defaultLines =
      kind === 'bill'
        ? [
            { glAccountId: '',                        side: 'debit'  as const, amount: '', description: '' },
            { glAccountId: apAccount?.id ?? '',       side: 'credit' as const, amount: '', description: '' },
          ]
        : [
            { glAccountId: arAccount?.id ?? '',       side: 'debit'  as const, amount: '', description: '' },
            { glAccountId: '',                        side: 'credit' as const, amount: '', description: '' },
          ]

    const base: FormState = {
      ...emptyForm,
      ...(saved ?? {}),
      kind,
      lines: defaultLines,
      startDate: todayAU(),
      firstDueDate: todayAU(),
    }

    setForm(base)
    setErrors({})
    setTab('Overview')
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(t: TemplateRow) {
    setForm(templateToForm(t))
    setErrors({})
    setTab('Overview')
    setEditId(t.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      // Jump to the first tab with errors
      const hasOverview = errs.name
      const hasFrequency = errs.startDate || errs.interval || errs.endDate || errs.totalOccurrences
      if (hasOverview) setTab('Overview')
      else if (hasFrequency) setTab('Frequency')
      else setTab('Transaction')
      return
    }
    setSaving(true)
    try {
      const body = formToBody(form)
      const url  = editId ? `/api/finance/templates/${editId}` : '/api/finance/templates'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Save failed')
        return
      }
      toast.success(editId ? 'Template updated' : 'Template created')
      saveTemplateDefaults(form)
      closeForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleEnabled(t: TemplateRow) {
    const res = await fetch(`/api/finance/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !t.enabled }),
    })
    if (res.ok) {
      toast.success(t.enabled ? 'Template disabled' : 'Template enabled')
      await load()
    } else {
      toast.error('Failed to update template')
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/finance/templates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      toast.success(
        data.orphanedDrafts > 0
          ? `Template deleted. ${data.orphanedDrafts} draft(s) remain but are no longer linked.`
          : 'Template deleted',
      )
      setDeleteTarget(null)
      await load()
    } else {
      toast.error('Failed to delete template')
    }
  }

  return {
    templates, glAccounts, contacts, accounts, categories, entities, members, locations,
    form, setForm, errors, setErrors, tab, setTab,
    saving, showForm, editId, deleteTarget, setDeleteTarget,
    openCreate, openEdit, closeForm, handleSave, handleToggleEnabled, handleDelete,
  }
}
