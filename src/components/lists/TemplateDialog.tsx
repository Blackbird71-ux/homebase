'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { SaveIcon, FileDownIcon, Loader2Icon, Trash2Icon } from 'lucide-react'

interface Template {
  id: string
  name: string
  type: string
  _count: { items: number }
}

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listId: string | null
  listName: string
  listType: 'SHOPPING' | 'TODO'
  onCloneToList: (templateId: string, listName: string) => Promise<void>
}

export function TemplateDialog({
  open,
  onOpenChange,
  listId,
  listName,
  listType,
  onCloneToList,
}: TemplateDialogProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSaveName('')
      setCloneName('')
      loadTemplates()
    }
  }, [open])

  async function loadTemplates() {
    setLoading(true)
    try {
      const res = await fetch('/api/lists/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAsTemplate() {
    if (!saveName.trim() || !listId) return
    setSaving(true)
    try {
      // Fetch current items from the list
      const itemsRes = await fetch(`/api/lists/${listId}/items`)
      if (!itemsRes.ok) throw new Error('Failed to fetch items')
      const items = await itemsRes.json()

      const res = await fetch('/api/lists/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          type: listType,
          items: items.map((i: { content: string; category: string | null }) => ({
            content: i.content,
            category: i.category,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save template')
      }

      toast.success('Template saved')
      setSaveName('')
      loadTemplates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function handleClone(templateId: string) {
    const name = cloneName || `${templates.find((t) => t.id === templateId)?.name || 'New'} List`
    if (!name.trim()) return
    setCloningId(templateId)
    try {
      await onCloneToList(templateId, name.trim())
      toast.success('List created from template')
      setCloneName('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setCloningId(null)
    }
  }

  async function handleDelete(templateId: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    setDeletingId(templateId)
    try {
      const res = await fetch(`/api/lists/templates/${templateId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete template')
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      toast.success('Template deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredTemplates = templates.filter((t) => t.type === listType)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>List Templates</DialogTitle>
          <DialogDescription>
            Save the current list as a template, or create a new list from an existing template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Save current list as template */}
          {listId && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Save &ldquo;{listName}&rdquo; as template</p>
              <div className="flex gap-2">
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Template name..."
                  className="flex-1"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAsTemplate()
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleSaveAsTemplate}
                  disabled={saving || !saveName.trim()}
                >
                  {saving ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SaveIcon className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Existing templates */}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {listType === 'SHOPPING' ? 'Shopping' : 'To-Do'} Templates
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No templates yet. Save a list as a template to get started.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {template._count.items} item{template._count.items !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        value={cloningId === template.id ? cloneName : ''}
                        onChange={(e) => setCloneName(e.target.value)}
                        placeholder="New list name..."
                        className="h-8 w-32 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleClone(template.id)
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => handleClone(template.id)}
                        disabled={cloningId === template.id}
                      >
                        {cloningId === template.id ? (
                          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDownIcon className="h-3.5 w-3.5" />
                        )}
                        Clone
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(template.id)}
                        disabled={deletingId === template.id}
                      >
                        {deletingId === template.id ? (
                          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
