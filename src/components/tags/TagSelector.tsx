'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { XIcon, PlusIcon, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface Tag {
  id: string
  name: string
  color?: string | null
}

interface TagSelectorProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  scope?: string
}

export function TagSelector({ value, onChange, placeholder = 'Add tags...', disabled = false, scope }: TagSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<string[]>([])

  const tagsUrl = scope ? `/api/tags?scope=${encodeURIComponent(scope)}` : '/api/tags'

  // Load tags on mount so inline display has colors from the start
  useEffect(() => {
    fetch(tagsUrl)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAllTags(data))
      .catch(() => {})
  }, [tagsUrl])

  async function openModal() {
    setPending([...value])
    setSearch('')
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(tagsUrl)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAllTags(data)
    } catch {
      setAllTags([])
    } finally {
      setLoading(false)
    }
  }

  function toggleTag(name: string) {
    setPending(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    )
  }

  function handleCreateNew() {
    const trimmed = search.trim()
    if (!trimmed || pending.includes(trimmed)) return
    setPending(prev => [...prev, trimmed])
    setSearch('')
  }

  function handleApply() {
    onChange(pending)
    setOpen(false)
  }

  function handleRemoveTag(tagName: string) {
    onChange(value.filter(t => t !== tagName))
  }

  const filtered = allTags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )
  const canCreate =
    !!search.trim() &&
    !allTags.some(t => t.name.toLowerCase() === search.trim().toLowerCase())

  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[42px]">
        {value.map((tagName) => {
          const tag = allTags.find(t => t.name === tagName)
          const color = tag?.color
          return (
            <div
              key={tagName}
              className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded-md"
              style={{
                backgroundColor: color ? `${color}20` : undefined,
                color: color || undefined,
              }}
            >
              {color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              <span>{tagName}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-primary/20"
                onClick={() => handleRemoveTag(tagName)}
                disabled={disabled}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={openModal}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {value.length === 0 ? placeholder : 'Add more tags...'}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Search tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (canCreate) handleCreateNew()
                  else if (filtered.length === 1) toggleTag(filtered[0].name)
                }
              }}
            />
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {canCreate && (
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted flex items-center gap-2"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Create &ldquo;{search.trim()}&rdquo;
                  </button>
                )}
                {filtered.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.name)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors ${
                      pending.includes(tag.name)
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {tag.color && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      {tag.name}
                    </span>
                    {pending.includes(tag.name) && (
                      <XIcon className="h-3.5 w-3.5 opacity-60" />
                    )}
                  </button>
                ))}
                {filtered.length === 0 && !canCreate && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No tags found
                  </p>
                )}
              </div>
            )}
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                {pending.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => toggleTag(t)}
                      className="hover:text-destructive"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleApply}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
