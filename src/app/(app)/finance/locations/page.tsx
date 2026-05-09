'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Location {
  id: string; name: string; address: string | null
  type: string; color: string | null; icon: string | null
  isActive: boolean; sortOrder: number
}

const LOCATION_TYPES = ['primary', 'secondary', 'vacation', 'business', 'other']

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState({
    name: '', address: '', type: 'primary', color: '#10B981', icon: '',
  })

  async function load() {
    setLoading(true)
    try { const res = await fetch('/api/finance/locations'); if (res.ok) setLocations(await res.json()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null); setForm({ name: '', address: '', type: 'primary', color: '#10B981', icon: '' })
    setShowForm(true)
  }
  function openEdit(loc: Location) {
    setEditing(loc); setForm({
      name: loc.name, address: loc.address ?? '', type: loc.type,
      color: loc.color ?? '#10B981', icon: loc.icon ?? '',
    }); setShowForm(true)
  }

  async function handleSave() {
    const body = editing ? { id: editing.id, ...form } : form
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch('/api/finance/locations', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Location updated' : 'Location created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this location?')) return
    const res = await fetch(`/api/finance/locations?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Location deleted'); load() }
    else toast.error('Failed to delete')
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading locations…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Locations</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(null) } }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Location' : 'New Location'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                {LOCATION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Address</label>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="h-8 w-8 rounded cursor-pointer" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No locations yet. Add your first location above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map(loc => (
            <div key={loc.id} className="rounded-lg border border-border p-4 cursor-default"
              onDoubleClick={() => openEdit(loc)}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: loc.color ?? '#10B981' }} />
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{loc.name}</span>
                {!loc.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
              </div>
              {loc.address && <p className="text-xs text-muted-foreground mb-1">{loc.address}</p>}
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{loc.type}</span>
              <div className="flex gap-1 mt-3">
                <button onClick={() => openEdit(loc)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(loc.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}