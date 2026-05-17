'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColorPicker } from '@/components/ui/color-picker'
import { toast } from 'sonner'
import { SearchIcon, PlusIcon, EditIcon, TrashIcon, Loader2, ArrowRightLeftIcon, Smile, X } from 'lucide-react'

type TagScope = 'general' | 'recipe' | 'note' | 'trip'

interface Tag {
  id: string
  name: string
  color: string | null
  emoji: string | null
  sortOrder: number
  scope: TagScope
  createdAt: string
  recipeCount: number
}

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
]

// Common emojis for trip tags
const TRIP_EMOJI_PRESETS = [
  '⚡','⛽','📶','🚿','🏊','🍕','☕','🎭','🎨','🚗',
  '✈️','🚂','🚢','🏔️','🏖️','🏕️','⭐','🔥','📍','💡',
  '🔑','🎁','🏆','🚩','🔔','💰','📅','⏰','🧾','💊',
]

const SCOPE_OPTIONS: { value: TagScope; label: string; description: string }[] = [
  { value: 'general', label: 'General', description: 'Appears in all tag selectors' },
  { value: 'recipe', label: 'Recipe', description: 'Only appears when tagging recipes' },
  { value: 'note', label: 'Notes', description: 'Only appears when tagging notes' },
  { value: 'trip', label: 'Trip', description: 'Appears on trip days and activities' },
]

const SCOPE_TABS: { value: TagScope | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'note', label: 'Notes' },
  { value: 'trip', label: 'Trip' },
]

function scopeBadge(scope: TagScope) {
  if (scope === 'recipe') return { label: 'Recipe', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  if (scope === 'note') return { label: 'Notes', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' }
  if (scope === 'trip') return { label: 'Trip', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
  return { label: 'General', className: 'bg-muted text-muted-foreground' }
}

// Minimal inline emoji picker for trip tags
function EmojiPresetPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`w-8 h-8 flex items-center justify-center rounded-md border text-xs transition-colors ${value === '' ? 'border-primary bg-primary/10' : 'border-input hover:bg-accent'}`}
        title="No emoji"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
      {TRIP_EMOJI_PRESETS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          className={`w-8 h-8 flex items-center justify-center rounded-md border text-base transition-colors ${value === emoji ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-input hover:bg-accent'}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TagScope | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)

  // Create form state
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')
  const [newTagScope, setNewTagScope] = useState<TagScope>('general')
  const [newTagEmoji, setNewTagEmoji] = useState('')

  // Edit form state
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('#6366f1')
  const [editTagScope, setEditTagScope] = useState<TagScope>('general')
  const [editTagEmoji, setEditTagEmoji] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [legacyCount, setLegacyCount] = useState(0)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    fetchTags()
    fetchLegacyCount()
  }, [])

  async function fetchTags() {
    try {
      setLoading(true)
      const res = await fetch(`/api/tags?includeCounts=true${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      setTags(data.sort((a: Tag, b: Tag) => a.name.localeCompare(b.name)))
    } catch (error) {
      toast.error('Failed to load tags')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLegacyCount() {
    try {
      const res = await fetch('/api/tags/legacy-count')
      if (!res.ok) return
      const data = await res.json()
      setLegacyCount(data.count)
    } catch {
      // non-critical
    }
  }

  async function handleMigrateLegacy() {
    setMigrating(true)
    try {
      const res = await fetch('/api/tags/migrate', { method: 'POST' })
      if (!res.ok) throw new Error('Migration failed')
      const data = await res.json()
      toast.success(`Migrated ${data.migratedTags} tag links across ${data.updatedRecipes} recipes`)
      setLegacyCount(0)
      await fetchTags()
    } catch (error: any) {
      toast.error(error.message || 'Migration failed')
    } finally {
      setMigrating(false)
    }
  }

  async function handleCreate() {
    if (!newTagName.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
          scope: newTagScope,
          emoji: newTagEmoji || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create tag')
      }
      const newTag = await res.json()
      setTags(prev => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTagName('')
      setNewTagColor('#6366f1')
      setNewTagScope('general')
      setNewTagEmoji('')
      setCreateOpen(false)
      toast.success('Tag created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create tag')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!selectedTag || !editTagName.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tags/${selectedTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTagName.trim(),
          color: editTagColor,
          scope: editTagScope,
          emoji: editTagEmoji || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update tag')
      }
      const updatedTag = await res.json()
      setTags(tags.map(tag => tag.id === selectedTag.id
        ? { ...updatedTag, recipeCount: selectedTag.recipeCount }
        : tag
      ))
      setEditOpen(false)
      setSelectedTag(null)
      toast.success('Tag updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update tag')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!selectedTag) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tags/${selectedTag.id}?action=delete`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete tag')
      }
      setTags(tags.filter(tag => tag.id !== selectedTag.id))
      setDeleteOpen(false)
      setSelectedTag(null)
      toast.success('Tag deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete tag')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditClick(tag: Tag) {
    setSelectedTag(tag)
    setEditTagName(tag.name)
    setEditTagColor(tag.color ?? '#6366f1')
    setEditTagScope(tag.scope ?? 'general')
    setEditTagEmoji(tag.emoji ?? '')
    setEditOpen(true)
  }

  function handleDeleteClick(tag: Tag) {
    setSelectedTag(tag)
    setDeleteOpen(true)
  }

  const visibleTags = activeTab === 'all' ? tags : tags.filter(t => t.scope === activeTab)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tag Management</h2>
          <p className="text-muted-foreground">Create, edit, and organise tags by category</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              New Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tag</DialogTitle>
              <DialogDescription>
                Choose a category to control where this tag appears.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">Tag Name</Label>
                <Input
                  id="tag-name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., Italian, Quick, WiFi, Fuel"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newTagScope} onValueChange={(v) => setNewTagScope(v as TagScope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{opt.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Emoji picker — only shown for trip scope */}
              {newTagScope === 'trip' && (
                <div className="space-y-2">
                  <Label>Emoji (optional)</Label>
                  <EmojiPresetPicker value={newTagEmoji} onChange={setNewTagEmoji} />
                  {newTagEmoji && (
                    <p className="text-xs text-muted-foreground">Selected: {newTagEmoji}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Tag Color</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        newTagColor === color ? 'border-white scale-110 ring-2 ring-offset-1 ring-foreground' : 'border-transparent hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <ColorPicker value={newTagColor} onChange={setNewTagColor} />
              </div>

              {/* Preview */}
              {newTagName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Preview:</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                    style={newTagColor ? { borderColor: newTagColor, backgroundColor: newTagColor + '20', color: newTagColor } : {}}
                  >
                    {newTagEmoji && <span>{newTagEmoji}</span>}
                    {newTagName}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !newTagName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Tag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Legacy tag migration banner */}
      {legacyCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <ArrowRightLeftIcon className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {legacyCount} legacy tag{legacyCount !== 1 ? 's' : ''} found
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
              These tags are stored in an old format and can't be managed. Migrate them to make them fully editable and deleteable.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 shrink-0"
            onClick={handleMigrateLegacy}
            disabled={migrating}
          >
            {migrating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Migrate
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Tags</CardTitle>
          <CardDescription>
            Tags are shared across your family. Use categories to control where each tag appears.
          </CardDescription>

          {/* Scope filter tabs */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {SCOPE_TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'hb-pill-inactive'
                }`}
              >
                {tab.label}
                {tab.value !== 'all' && (
                  <span className={`text-xs px-1.5 py-px rounded-full font-semibold leading-none ${
                    activeTab === tab.value
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/20 text-primary'
                  }`}>
                    {tags.filter(t => t.scope === tab.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="relative mt-4">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTags()}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleTags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No tags found matching your search' : 'No tags in this category yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-2">Uses</div>
                <div className="col-span-2">Created</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {visibleTags.map((tag) => {
                const badge = scopeBadge(tag.scope)
                return (
                  <div key={tag.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center border rounded-lg hover:bg-muted/50">
                    <div className="col-span-4 font-medium">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={tag.color ? { borderColor: tag.color, backgroundColor: tag.color + '20', color: tag.color } : {}}
                      >
                        {tag.emoji && <span>{tag.emoji}</span>}
                        {tag.color && !tag.emoji && (
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                        )}
                        {tag.name}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-muted-foreground text-sm">
                      {tag.recipeCount}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {new Date(tag.createdAt).toLocaleDateString()}
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditClick(tag)}>
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteClick(tag)} title="Delete tag">
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>Update the name, category, and colour of this tag.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">Tag Name</Label>
              <Input
                id="edit-tag-name"
                value={editTagName}
                onChange={(e) => setEditTagName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editTagScope} onValueChange={(v) => setEditTagScope(v as TagScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{opt.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Emoji picker — shown for trip scope */}
            {editTagScope === 'trip' && (
              <div className="space-y-2">
                <Label>Emoji (optional)</Label>
                <EmojiPresetPicker value={editTagEmoji} onChange={setEditTagEmoji} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Tag Color</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditTagColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      editTagColor === color ? 'border-white scale-110 ring-2 ring-offset-1 ring-foreground' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <ColorPicker value={editTagColor} onChange={setEditTagColor} />
            </div>

            {/* Preview */}
            {editTagName && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preview:</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  style={editTagColor ? { borderColor: editTagColor, backgroundColor: editTagColor + '20', color: editTagColor } : {}}
                >
                  {editTagEmoji && <span>{editTagEmoji}</span>}
                  {editTagName}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={submitting || !editTagName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the tag &ldquo;{selectedTag?.name}&rdquo;?
              {selectedTag && selectedTag.recipeCount > 0 && (
                <span className="text-destructive block mt-1">
                  This tag is used {selectedTag.recipeCount} time{selectedTag.recipeCount !== 1 ? 's' : ''}.
                  Deleting it will remove it from all associated recipes, days, and activities.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
