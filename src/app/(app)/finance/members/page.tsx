'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Member {
  id: string
  name: string
  email: string
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
      const err = await res.json()
      toast.error(err.error ?? 'Failed to save member')
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this member from the family?')) return
    const res = await fetch(`/api/finance/members?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Member removed')
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to remove')
    }
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading members…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Family Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to this family's finances.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Add Member
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Member' : 'Add Family Member'}</h3>
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
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium"
            >
              {editing ? 'Update' : 'Add'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditing(null) }}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No family members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
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