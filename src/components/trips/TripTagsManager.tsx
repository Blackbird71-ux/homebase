'use client'

import { useState, useEffect } from 'react'
import { Tag, Plus, X, Pencil, Loader2, Check } from 'lucide-react'
import type { TripTagShape } from '@/types'

// ── Common tag colours ──────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
  '#64748b', '#000000',
]

interface TripTagsManagerProps {
  open: boolean
  onClose: () => void
  /** Called whenever tags change so callers can refresh their local tag list */
  onChanged?: (tags: TripTagShape[]) => void
}

export function TripTagsManager({ open, onClose, onChanged }: TripTagsManagerProps) {
  const [tags, setTags]         = useState<TripTagShape[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // Create form
  const [newName, setNewName]   = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [saving, setSaving]     = useState(false)

  // Edit state
  const [editId, setEditId]     = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetchTags()
  }, [open])

  async function fetchTags() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/trips/tags')
      if (res.ok) {
        const data = await res.json()
        setTags(data)
        onChanged?.(data)
      }
    } catch {
      setError('Failed to load tags')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/trips/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), emoji: newEmoji.trim() || null, color: newColor }),
      })
      if (res.ok) {
        const tag = await res.json()
        const updated = [...tags, tag]
        setTags(updated)
        onChanged?.(updated)
        setNewName('')
        setNewEmoji('')
        setNewColor('#3b82f6')
      } else {
        const d = await res.json()
        setError(d.error ?? 'Failed to create tag')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/trips/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), emoji: editEmoji.trim() || null, color: editColor }),
      })
      if (res.ok) {
        const updated_tag = await res.json()
        const updated = tags.map((t) => (t.id === id ? { ...t, ...updated_tag } : t))
        setTags(updated)
        onChanged?.(updated)
        setEditId(null)
      }
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tag? It will be removed from all activities.')) return
    const res = await fetch(`/api/trips/tags/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = tags.filter((t) => t.id !== id)
      setTags(updated)
      onChanged?.(updated)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Trip Tag Manager</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Create form */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground mb-2">Create tags to label activities — WiFi, Fuel, Dump Point, Flying, etc.</p>
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              placeholder="😀"
              maxLength={2}
              className="w-12 px-2 py-1.5 text-center rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name…"
              className="flex-1 px-2.5 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: newColor === c ? 'white' : 'transparent',
                    outline: newColor === c ? `2px solid ${c}` : 'none',
                  }}
                />
              ))}
            </div>
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="shrink-0 p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>

        {/* Tags list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && tags.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No tags yet. Create one above.</p>
          )}
          {!loading && tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background hover:bg-accent/20 group">
              {editId === tag.id ? (
                <>
                  <input
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value)}
                    maxLength={2}
                    className="w-10 px-1.5 py-1 text-center rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className="w-3.5 h-3.5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: editColor === c ? 'white' : 'transparent',
                          outline: editColor === c ? `2px solid ${c}` : 'none',
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => handleSaveEdit(tag.id)}
                    disabled={editSaving || !editName.trim()}
                    className="p-1 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                  >
                    {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="p-1 rounded text-muted-foreground hover:bg-accent"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  {/* Tag preview */}
                  <span
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  >
                    {tag.emoji && <span>{tag.emoji}</span>}
                    {tag.name}
                  </span>
                  {typeof tag.usageCount === 'number' && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {tag.usageCount} use{tag.usageCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditId(tag.id)
                        setEditName(tag.name)
                        setEditEmoji(tag.emoji ?? '')
                        setEditColor(tag.color ?? '#64748b')
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
