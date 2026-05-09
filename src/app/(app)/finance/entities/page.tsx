'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Briefcase, Star, StarOff, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Entity {
  id: string
  name: string
  type: string
  description: string | null
  color: string | null
  icon: string | null
  isDefault: boolean
  sortOrder: number
  isActive: boolean
}

const ENTITY_TYPES = [
  { value: 'personal',   label: 'Personal / Family' },
  { value: 'superfund',  label: 'Super Fund' },
  { value: 'trust',      label: 'Trust' },
  { value: 'business',   label: 'Business' },
  { value: 'investment', label: 'Investment' },
  { value: 'other',      label: 'Other' },
]

const PRESET_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308',
  '#22C55E', '#14B8A6', '#3B82F6', '#F43F5E', '#A855F7',
  '#64748B', '#0EA5E9', '#D97706', '#16A34A', '#DC2626',
]

function typeLabel(type: string) {
  return ENTITY_TYPES.find(t => t.value === type)?.label ?? type
}

const emptyForm = {
  name: '',
  type: 'personal',
  description: '',
  color: '#6366F1',
  isDefault: false,
  sortOrder: 0,
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Entity | null>(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/entities?includeInactive=true')
      if (res.ok) setEntities(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm({ ...emptyForm, sortOrder: entities.length })
    setShowForm(true)
  }

  function openEdit(e: Entity) {
    setEditing(e)
    setForm({
      name: e.name,
      type: e.type,
      description: e.description ?? '',
      color: e.color ?? '#6366F1',
      isDefault: e.isDefault,
      sortOrder: e.sortOrder,
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null) }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        ...form,
        description: form.description || null,
        color: form.color || null,
      }
      const res = await fetch('/api/finance/entities', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editing ? 'Entity updated' : 'Entity created')
        closeForm()
        load()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleDefault(entity: Entity) {
    const res = await fetch('/api/finance/entities', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entity.id, isDefault: !entity.isDefault }),
    })
    if (res.ok) { toast.success(entity.isDefault ? 'Default cleared' : 'Set as default'); load() }
    else toast.error('Failed to update')
  }

  async function handleDelete(entity: Entity) {
    if (entity.isDefault) {
      toast.error('Cannot deactivate the default entity — clear the default flag first.')
      return
    }
    if (!confirm(`Deactivate "${entity.name}"? It will no longer appear in selectors but linked bills and budgets keep their data.`)) return
    const res = await fetch(`/api/finance/entities?id=${entity.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Entity deactivated'); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleReactivate(entity: Entity) {
    const res = await fetch('/api/finance/entities', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entity.id, isActive: true }),
    })
    if (res.ok) { toast.success('Entity reactivated'); load() }
    else toast.error('Failed to reactivate')
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading entities…</div>

  const activeEntities   = entities.filter(e => e.isActive)
  const inactiveEntities = entities.filter(e => !e.isActive)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Named financial entities — Super funds, trusts, businesses — that bills and budgets can be assigned to.
          </p>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Entity
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-4 bg-card">
          <h3 className="font-semibold text-base">{editing ? 'Edit Entity' : 'New Entity'}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Smith Family Super"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                {ENTITY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Description (optional)</label>
              <input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="e.g. SMSF holding investment properties"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Colour</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className="w-6 h-6 rounded cursor-pointer border border-input"
                  title="Custom colour"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Sort order</label>
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit select-none">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))}
              className="rounded border-input"
            />
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            Mark as default entity
            <span className="text-xs text-muted-foreground">(shown first / pre-selected in dropdowns)</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
            <button onClick={closeForm} className="rounded-md border border-border px-4 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {activeEntities.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No entities yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Add entities like a Super fund, trust, or business to keep their bills and
            budgets separate from your household finances.
          </p>
          <button
            onClick={openNew}
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add First Entity
          </button>
        </div>
      )}

      {/* Active entities list */}
      {activeEntities.length > 0 && (
        <div className="space-y-2">
          {activeEntities.map(entity => (
            <div
              key={entity.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors cursor-default"
              onDoubleClick={() => openEdit(entity)}
            >
              {/* Colour avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: entity.color ?? '#6B7280' }}
              >
                {entity.name.slice(0, 2).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{entity.name}</span>
                  {entity.isDefault && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded-full font-medium">
                      <Star className="h-2.5 w-2.5 fill-current" /> DEFAULT
                    </span>
                  )}
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                    {typeLabel(entity.type)}
                  </span>
                </div>
                {entity.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{entity.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleToggleDefault(entity)}
                  title={entity.isDefault ? 'Clear default' : 'Set as default'}
                  className={cn(
                    'p-1 hover:bg-accent rounded',
                    entity.isDefault ? 'text-yellow-500' : 'text-muted-foreground',
                  )}
                >
                  {entity.isDefault
                    ? <Star className="h-3.5 w-3.5 fill-current" />
                    : <StarOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => openEdit(entity)} className="p-1 hover:bg-accent rounded" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(entity)}
                  className="p-1 hover:bg-accent rounded text-red-500"
                  title="Deactivate entity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inactive / deactivated section */}
      {inactiveEntities.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deactivated</p>
          {inactiveEntities.map(entity => (
            <div
              key={entity.id}
              className="flex items-center gap-3 rounded-lg border border-border/50 p-3 opacity-60"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 grayscale"
                style={{ backgroundColor: entity.color ?? '#6B7280' }}
              >
                {entity.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium line-through text-muted-foreground">{entity.name}</span>
                <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {typeLabel(entity.type)}
                </span>
              </div>
              <button
                onClick={() => handleReactivate(entity)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                title="Reactivate"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
