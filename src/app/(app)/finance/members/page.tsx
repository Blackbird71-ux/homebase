'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHero } from '@/components/shared/PageHero'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'

interface Member {
  id: string
  name: string
  email: string
  _count?: { bills: number; income: number; transactions: number }
}

export default function FinanceMembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState({ email: '', name: '' })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/members')
      if (res.ok) setMembers(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm({ email: '', name: '' })
    setShowForm(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({ email: m.email, name: m.name })
    setShowForm(true)
  }

  async function handleSave() {
    const method = editing ? 'PUT' : 'POST'
    const body = editing ? { id: editing.id, name: form.name } : form
    const res = await fetch('/api/finance/members', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success(editing ? 'Member updated' : 'Member added')
      setShowForm(false)
      setEditing(null)
      load()
    } else {
      const err = await res.json().catch(() => null)
      toast.error(err?.error ?? 'Failed to save member')
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this member from the family?')) return
    const res = await fetch(`/api/finance/members?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Member removed')
      load()
    } else {
      const err = await res.json().catch(() => null)
      toast.error(err?.error ?? 'Failed to remove')
    }
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading members…</div>

  return (
    <div className="space-y-6">
      <PageHero title="Family Members" subtitle="Manage who has access to this family's finances." />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Member
        </button>
      </div>

      <Drawer open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(null) } }}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{editing ? 'Edit Member' : 'Add Family Member'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              {editing
                ? 'Update the member name.'
                : 'Enter the email of an existing user to add them to your family.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email *</label>
                <input
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder="jane@example.com"
                  disabled={!!editing}
                />
              </div>
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Add'}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No family members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 cursor-default"
              onDoubleClick={() => openEdit(m)}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
                {m._count && (m._count.bills + m._count.income + m._count.transactions) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[m._count.bills > 0 && `${m._count.bills} bill${m._count.bills !== 1 ? 's' : ''}`, m._count.income > 0 && `${m._count.income} income`, m._count.transactions > 0 && `${m._count.transactions} transaction${m._count.transactions !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => openEdit(m)}
                className="p-1 hover:bg-accent rounded"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleRemove(m.id)}
                className="p-1 hover:bg-accent rounded text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}