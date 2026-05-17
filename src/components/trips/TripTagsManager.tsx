'use client'

import { useState, useEffect, useRef } from 'react'
import { Tag, Plus, X, Pencil, Loader2, Check, Smile } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TripTagShape } from '@/types'

// ── Preset colours ──────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#64748b', '#000000',
]

// ── Emoji picker data ───────────────────────────────────────────────────────
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Travel',
    emojis: [
      '✈️','🚂','🚢','🚗','🏍️','🛺','🚐','🚁','🛸','🛩️',
      '⛵','🚤','🗺️','🧭','🏔️','🏖️','🏕️','🌍','🌏','🗼',
      '🗽','🏯','🕌','⛩️','🎡','🎢','🎠','🚀','🛳️','🚞',
    ],
  },
  {
    label: 'Food & Drink',
    emojis: [
      '🍕','🍔','🍣','🍜','🍛','🍱','🌮','🌯','🥗','🍝',
      '🍦','🍰','☕','🍵','🧋','🍺','🍷','🥤','🍹','🧃',
      '🥐','🍳','🥞','🧇','🥓','🍗','🦐','🦞','🍤','🥩',
    ],
  },
  {
    label: 'Activities',
    emojis: [
      '⛽','📶','🚿','🏊','🎿','🏄','🧗','🚵','🎭','🎨',
      '🎬','🎵','🎤','🎸','🎮','🎯','🎳','🏋️','🤸','🧘',
      '🏌️','🎾','⚽','🏀','🎱','🪂','🤿','🧜','🚴','🏇',
    ],
  },
  {
    label: 'Places',
    emojis: [
      '🏨','🏩','🏪','🏫','🏬','🏭','🏦','🏥','⛪','🕍',
      '🛖','🏠','🏡','🏢','🌇','🌆','🌃','🌉','🌁','🏟️',
      '🏛️','🏗️','⛺','🗿','🗻','🌋','🏝️','🏜️','🏞️','🌄',
    ],
  },
  {
    label: 'Symbols',
    emojis: [
      '⭐','❤️','🔥','💫','✅','❌','⚠️','💡','📍','📌',
      '🔑','💎','🎁','🏆','🥇','🎖️','🚩','🔔','💬','📞',
      '💰','💳','🧾','📋','📝','🗒️','📅','⏰','🔋','💊',
    ],
  },
]

// ── Emoji Picker component ──────────────────────────────────────────────────
function EmojiPicker({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (emoji: string) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute z-[100] bottom-full mb-1 left-0 w-72 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
    >
      {/* Tab bar */}
      <div className="flex border-b border-border bg-muted/40 overflow-x-auto">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
              activeTab === i
                ? 'bg-popover text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
        {/* Clear option */}
        <button
          type="button"
          onClick={() => { onChange(''); onClose() }}
          className={`flex items-center justify-center w-8 h-8 rounded text-xs hover:bg-accent transition-colors ${value === '' ? 'bg-accent' : ''}`}
          title="No emoji"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
        {EMOJI_CATEGORIES[activeTab].emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onChange(emoji); onClose() }}
            className={`flex items-center justify-center w-8 h-8 rounded text-base hover:bg-accent transition-colors ${value === emoji ? 'bg-primary/15 ring-1 ring-primary' : ''}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Colour swatch row ───────────────────────────────────────────────────────
function ColorSwatches({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
          style={{
            backgroundColor: c,
            outline: value === c ? `2px solid ${c}` : '2px solid transparent',
            outlineOffset: '2px',
            boxShadow: value === c ? '0 0 0 1px white inset' : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

interface TripTagsManagerProps {
  open: boolean
  onClose: () => void
  onChanged?: (tags: TripTagShape[]) => void
}

export function TripTagsManager({ open, onClose, onChanged }: TripTagsManagerProps) {
  const [tags, setTags]       = useState<TripTagShape[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Create form
  const [newName, setNewName]   = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [saving, setSaving]     = useState(false)
  const [showNewEmojiPicker, setShowNewEmojiPicker] = useState(false)

  // Edit state
  const [editId, setEditId]           = useState<string | null>(null)
  const [editName, setEditName]       = useState('')
  const [editEmoji, setEditEmoji]     = useState('')
  const [editColor, setEditColor]     = useState('')
  const [editSaving, setEditSaving]   = useState(false)
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false)

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
        body: JSON.stringify({ name: newName.trim(), emoji: newEmoji || null, color: newColor }),
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
        body: JSON.stringify({ name: editName.trim(), emoji: editEmoji || null, color: editColor }),
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

  function startEdit(tag: TripTagShape) {
    setEditId(tag.id)
    setEditName(tag.name)
    setEditEmoji(tag.emoji ?? '')
    setEditColor(tag.color ?? '#64748b')
    setShowEditEmojiPicker(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Trip Tag Manager
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Tags are shared across all trips. Use them to label activities — WiFi, Fuel, Dump Point, Flying, etc.
        </p>

        {/* Create form */}
        <form onSubmit={handleCreate} className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Tag</p>

          <div className="flex items-center gap-2">
            {/* Emoji picker trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNewEmojiPicker((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors text-base shrink-0"
                title="Pick emoji"
              >
                {newEmoji || <Smile className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showNewEmojiPicker && (
                <EmojiPicker
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e)}
                  onClose={() => setShowNewEmojiPicker(false)}
                />
              )}
            </div>

            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name…"
              className="flex-1 px-2.5 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="shrink-0 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>

          <ColorSwatches value={newColor} onChange={setNewColor} />

          {/* Preview */}
          {newName && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: newColor }}
              >
                {newEmoji && <span>{newEmoji}</span>}
                {newName}
              </span>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        {/* Tags list */}
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && tags.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No tags yet. Create one above.
            </div>
          )}

          {!loading && tags.map((tag) => (
            <div
              key={tag.id}
              className="rounded-lg border border-border bg-background overflow-hidden"
            >
              {editId === tag.id ? (
                /* ── Edit row ── */
                <div className="p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    {/* Emoji picker for edit */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEditEmojiPicker((v) => !v)}
                        className="w-9 h-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors text-base shrink-0"
                      >
                        {editEmoji || <Smile className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {showEditEmojiPicker && (
                        <EmojiPicker
                          value={editEmoji}
                          onChange={(e) => setEditEmoji(e)}
                          onClose={() => setShowEditEmojiPicker(false)}
                        />
                      )}
                    </div>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => handleSaveEdit(tag.id)}
                      disabled={editSaving || !editName.trim()}
                      className="p-1.5 rounded-md text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 transition-colors"
                    >
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ColorSwatches value={editColor} onChange={setEditColor} />
                  {/* Edit preview */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Preview:</span>
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: editColor }}
                    >
                      {editEmoji && <span>{editEmoji}</span>}
                      {editName || 'Tag name'}
                    </span>
                  </div>
                </div>
              ) : (
                /* ── Display row ── */
                <div className="flex items-center gap-3 px-3 py-2.5 group">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white shrink-0"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  >
                    {tag.emoji && <span>{tag.emoji}</span>}
                    {tag.name}
                  </span>
                  {typeof tag.usageCount === 'number' && (
                    <span className="text-xs text-muted-foreground">
                      {tag.usageCount} use{tag.usageCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(tag)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
