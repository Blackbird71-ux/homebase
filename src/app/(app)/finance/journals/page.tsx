'use client'

import { useEffect, useState } from 'react'
import { Plus, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { cn, todayAU } from '@/lib/utils'
import { type GLAccount, type Entity, type JournalEntry, type ReversalState } from '@/components/finance/journal-types'
import { JournalEntryForm } from '@/components/finance/JournalEntryForm'
import { ReversalDialog }   from '@/components/finance/ReversalDialog'
import { VoidDialog }       from '@/components/finance/VoidDialog'
import { JournalEntryRow }  from '@/components/finance/JournalEntryRow'

export default function JournalsPage() {
  const [entries, setEntries]       = useState<JournalEntry[]>([])
  const [glAccounts, setGLAccounts] = useState<GLAccount[]>([])
  const [entities, setEntities]     = useState<Entity[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const limit = 50

  const [loading, setLoading]   = useState(true)
  const [posting, setPosting]   = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<'manual' | 'draft' | 'all-posted'>('manual')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<JournalEntry | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [reversal, setReversal] = useState<ReversalState | null>(null)
  const [voidTarget, setVoidTarget] = useState<JournalEntry | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (filterTab === 'manual')     { params.set('isPosted', 'true');  params.set('typeFilter', 'manual') }
      else if (filterTab === 'draft') { params.set('isPosted', 'false'); params.set('typeFilter', 'manual') }
      else                            { params.set('isPosted', 'true');  params.set('typeFilter', 'all') }
      const res = await fetch(`/api/finance/journals?${params}`)
      if (res.ok) { const data = await res.json(); setEntries(data.entries ?? []); setTotal(data.total ?? 0) }
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    const [cRes, eRes] = await Promise.all([
      fetch('/api/finance/categories?forPicker=true'),
      fetch('/api/finance/entities'),
    ])
    if (cRes.ok) {
      const cats: GLAccount[] = await cRes.json()
      setGLAccounts(cats.filter(c => c.type !== 'transfer'))
    }
    if (eRes.ok) setEntities(await eRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { load() }, [page, filterTab]) // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() { setEditing(null); setShowForm(true) }

  function openEdit(entry: JournalEntry) {
    if (entry.isPosted) { toast.info('Posted entries cannot be edited. Create a reversal to correct them.'); return }
    setEditing(entry)
    setShowForm(true)
  }

  async function handlePost(entry: JournalEntry) {
    if (entry.isPosted) return
    setPosting(entry.id)
    try {
      const res = await fetch('/api/finance/journals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action: 'post' }),
      })
      if (res.ok) { toast.success(`${entry.reference ?? 'Entry'} posted to the ledger`); load() }
      else { const err = await res.json(); toast.error(err.error ?? 'Failed to post entry') }
    } finally { setPosting(null) }
  }

  async function handleDelete(entry: JournalEntry) {
    if (!entry.isPosted) {
      if (!confirm(`Delete draft ${entry.reference ?? 'entry'}: "${entry.description}"?`)) return
      const res = await fetch(`/api/finance/journals?id=${entry.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Draft deleted'); load() }
      else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
      return
    }
    if (entry.isPosted && entry.isReversed) {
      if (!confirm(`Permanently delete voided entry ${entry.reference ?? ''} and its void reversal? This cannot be undone.`)) return
      const res = await fetch(`/api/finance/journals?id=${entry.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Voided entry permanently deleted'); load() }
      else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
      return
    }
    if (entry.isPosted && entry.type === 'reversal') {
      if (!confirm(`Delete void/reversal entry ${entry.reference ?? ''}: "${entry.description}"? The original entry will be restored to un-voided state.`)) return
      const res = await fetch(`/api/finance/journals?id=${entry.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Reversal deleted — original entry restored'); load() }
      else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
      return
    }
    if (entry.isPosted && entry.type === 'auto_transaction') {
      if (!confirm(`Delete journal entry ${entry.reference ?? ''}: "${entry.description}"? This cannot be undone.`)) return
      const res = await fetch(`/api/finance/journals?id=${entry.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Journal entry deleted'); load() }
      else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
      return
    }
    toast.error('Void this entry first, then delete.')
  }

  function openReversal(entry: JournalEntry) {
    setReversal({
      entry,
      date:        todayAU(),
      description: `Reversal of ${entry.reference ?? entry.id}: ${entry.description}`,
    })
  }

  if (loading && entries.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">Loading journal entries…</div>
  }

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Journal Entries</h1>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> New Entry
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
        {(['manual', 'draft', 'all-posted'] as const).map(tab => (
          <button key={tab}
            onClick={() => { setFilterTab(tab); setPage(1) }}
            className={cn(
              'px-3 py-1 text-xs rounded-md font-medium transition-colors',
              filterTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'manual' ? 'Manual' : tab === 'draft' ? 'Draft' : 'All Posted'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">
            {filterTab === 'manual' ? 'Posted manual entries' : filterTab === 'draft' ? 'Draft manual entries' : 'All posted entries (total)'}
          </p>
          <p className="text-xl font-bold">{total}</p>
        </div>
        <div className={cn('rounded-lg border p-3', filterTab === 'draft' ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5')}>
          <p className="text-xs text-muted-foreground mb-1">This page</p>
          <p className={cn('text-xl font-bold', filterTab === 'draft' ? 'text-amber-600' : 'text-green-600')}>{entries.length}</p>
        </div>
      </div>

      <JournalEntryForm
        open={showForm}
        editing={editing}
        glAccounts={glAccounts}
        entities={entities}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSaved={load}
      />

      <ReversalDialog
        reversal={reversal}
        onClose={() => setReversal(null)}
        onSaved={load}
      />

      <VoidDialog
        entry={voidTarget}
        onClose={() => setVoidTarget(null)}
        onSaved={load}
      />

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {filterTab === 'draft' ? 'No draft entries' : filterTab === 'all-posted' ? 'No posted entries found' : 'No posted manual journal entries yet'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {filterTab === 'draft'
              ? 'Save a new entry as a draft using the editor above, or check the Manual tab for posted entries.'
              : filterTab === 'all-posted'
              ? 'This forensic view shows every posted entry — nothing has been posted yet.'
              : 'Create manual entries for depreciation, adjustments, accruals, and corrections.'}
          </p>
          {filterTab !== 'all-posted' && (
            <button onClick={openNew} className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="h-4 w-4" /> New entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              posting={posting}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onPost={handlePost}
              onEdit={openEdit}
              onDelete={handleDelete}
              onVoid={e => setVoidTarget(e)}
              onReverse={openReversal}
            />
          ))}
        </div>
      )}

      {Math.ceil(total / limit) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / limit)}</span>
          <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">
            Next
          </button>
        </div>
      )}

    </div>
  )
}
