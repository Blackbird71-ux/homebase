'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  const editorRef              = useRef<HTMLDivElement>(null)
  const textColorInputRef      = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef          = useRef<Range | null>(null)
  const savedEditableRef       = useRef<HTMLDivElement | null>(null)
  const [textColor, setTextColor]           = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')
  const [saving, setSaving]                 = useState(false)

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
      savedRangeRef.current    = sel.getRangeAt(0).cloneRange()
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[80vh] overflow-hidden p-0 gap-0" showCloseButton>
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle>Notes</DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{activityTitle}</p>
        </DialogHeader>

        {/* Toolbar — sits flush against the editor */}
        <div className="shrink-0 px-4 pt-3">
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
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          <div
            ref={editorRef}
            contentEditable={!saving}
            suppressContentEditableWarning
            data-placeholder="Add notes with rich formatting…"
            className="min-h-[140px] py-3 text-sm outline-none focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60 prose prose-sm max-w-none border-x border-b border-input rounded-b-md px-3"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onOpenChange(false)
              }
            }}
          />
        </div>

        {/* Footer */}
        <DialogFooter showCloseButton>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
