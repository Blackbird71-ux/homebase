'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import { NoteEditorToolbar } from '@/components/notes/NoteEditorToolbar'

interface ActivityNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityTitle: string
  initialContent: string | null
  onSave: (htmlContent: string) => void
}

export function ActivityNoteDialog({
  open,
  onOpenChange,
  activityTitle,
  initialContent,
  onSave,
}: ActivityNoteDialogProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const savedEditableRef = useRef<HTMLDivElement | null>(null)
  const [textColor, setTextColor] = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')
  const [saving, setSaving] = useState(false)

  // Initialise editor content when dialog opens
  useEffect(() => {
    if (open && editorRef.current) {
      editorRef.current.innerHTML = initialContent || ''
    }
  }, [open, initialContent])

  const exec = useCallback((command: string, value?: string) => {
    const active = document.activeElement
    document.execCommand(command, false, value)
    if (active === editorRef.current) {
      ;(active as HTMLDivElement).focus()
    } else {
      editorRef.current?.focus()
    }
  }, [])

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://')
    if (url) exec('createLink', url)
  }

  const insertImage = () => {
    const url = prompt('Enter image URL:', 'https://')
    if (url) exec('insertImage', url)
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      savedEditableRef.current = editorRef.current
    }
  }

  const restoreSelection = () => {
    savedEditableRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
  }

  const applyTextColor = (color: string) => {
    setTextColor(color)
    restoreSelection()
    document.execCommand('foreColor', false, color)
    editorRef.current?.focus()
  }

  const applyHighlightColor = (color: string) => {
    setHighlightColor(color)
    restoreSelection()
    document.execCommand('hiliteColor', false, color)
    editorRef.current?.focus()
  }

  async function handleSave() {
    setSaving(true)
    try {
      const html = editorRef.current?.innerHTML ?? ''
      onSave(html)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Notes</h3>
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
              {activityTitle}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <NoteEditorToolbar
          exec={exec}
          insertLink={insertLink}
          insertImage={insertImage}
          saveSelection={saveSelection}
          applyTextColor={applyTextColor}
          applyHighlightColor={applyHighlightColor}
          textColorInputRef={textColorInputRef}
          highlightColorInputRef={highlightColorInputRef}
          textColor={textColor}
          highlightColor={highlightColor}
          isLoading={saving}
        />

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={editorRef}
            contentEditable={!saving}
            suppressContentEditableWarning
            data-placeholder="Add notes with rich formatting…"
            className="min-h-[120px] text-sm outline-none focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60 prose prose-sm max-w-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onOpenChange(false)
              }
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-3 py-1.5 rounded text-sm font-medium border border-input hover:bg-accent disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
