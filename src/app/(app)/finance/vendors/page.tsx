'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Building2, Globe, Phone, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Category { id: string; name: string; color: string | null }
interface Vendor {
  id: string; name: string; website: string | null; phone: string | null
  accountRef: string | null; notes: string | null
  defaultCategory: { id: string; name: string; color: string | null } | null
  _count: { recurringBills: number; transactions: number }
}

const AVATAR_COLORS = [
  '#6366F1','#8B5CF6','#EC4899','#F97316','#EAB308',
  '#22C55E','#14B8A6','#3B82F6','#F43F5E','#A855F7',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState({
    name: '', website: '', phone: '', accountRef: '', notes: '', defaultCategoryId: '',
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/vendors')
      if (res.ok) setVendors(await res.json())
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const res = await fetch('/api/finance/categories')
    if (res.ok) {
      const all: any[] = await res.json()
      setCategories(all.filter(c => c.type === 'expense'))
    }
  }

  useEffect(() => { loadRefs(); load() }, [])

  function openNew() {
    setEditing(null)
    setForm({ name: '', website: '', phone: '', accountRef: '', notes: '', defaultCategoryId: '' })
    setShowForm(true)
  }

  function openEdit(v: Vendor) {
    setEditing(v)
    setForm({
      name: v.name, website: v.website ?? '', phone: v.phone ?? '',
      accountRef: v.accountRef ?? '', notes: v.notes ?? '',
      defaultCategoryId: v.defaultCategory?.id ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    const body = editing
      ? { id: editing.id, ...form, defaultCategoryId: form.defaultCategoryId || null }
      : { ...form, defaultCategoryId: form.defaultCategoryId || null }
    const res = await fetch('/api/finance/vendors', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success(editing ? 'Vendor updated' : 'Vendor created')
      setShowForm(false); setEditing(null); load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to save')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this vendor? Bills and transactions will keep their data but lose the vendor link.')) return
    const res = await fetch(`/api/finance/vendors?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Vendor deleted'); load() }
    else toast.error('Failed to delete')
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading vendors…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Companies and services you pay bills to.</p>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Vendor
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Vendor' : 'New Vendor'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Origin Energy"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Default category</label>
              <select value={form.defaultCategoryId}
                onChange={e => setForm(p => ({ ...p, defaultCategoryId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Website</label>
              <input value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                placeholder="e.g. originenergy.com.au"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="e.g. 1300 000 000"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Account / reference number</label>
              <input value={form.accountRef} onChange={e => setForm(p => ({ ...p, accountRef: e.target.value }))}
                placeholder="e.g. ACC-12345"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Contract expires Jan 2027"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No vendors yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add vendors to assign to bills and track spending by supplier.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vendors.map(v => {
            const initials = v.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
            const color = avatarColor(v.name)
            return (
              <div key={v.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: color }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{v.name}</span>
                    {v.defaultCategory && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: v.defaultCategory.color ?? '#6B7280' }}>
                        {v.defaultCategory.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {v.website && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="h-3 w-3" />{v.website}
                      </span>
                    )}
                    {v.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />{v.phone}
                      </span>
                    )}
                    {v.accountRef && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Hash className="h-3 w-3" />{v.accountRef}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {v._count.recurringBills} bill{v._count.recurringBills !== 1 ? 's' : ''}
                      {v._count.transactions > 0 && ` · ${v._count.transactions} transaction${v._count.transactions !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {v.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{v.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(v)} className="p-1 hover:bg-accent rounded">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1 hover:bg-accent rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
