'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Edit3, Save, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface DocumentTextEditorProps {
  content: string
  ext: string
  documentId: string
  onContentSaved: (newContent: string) => void
}

export function DocumentTextEditor({
  content,
  ext,
  documentId,
  onContentSaved,
}: DocumentTextEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Sync content when document changes
  useEffect(() => {
    setEditContent(content)
    setIsEditing(false)
  }, [content])

  // Focus editor when entering edit mode
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.focus()
    }
  }, [isEditing])

  const isMarkdown = ext === 'md'

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/content`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editContent }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to save')
      }

      onContentSaved(editContent)
      setIsEditing(false)
      toast.success('Document saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditContent(content)
    setIsEditing(false)
  }

  // Simple markdown rendering for view mode
  function renderMarkdown(text: string): string {
    // Escape HTML
    let html = text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>')

    // Links
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr class="my-4 border-border" />')

    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, '</p><p>')
    html = html.replace(/\n/g, '<br />')

    return `<p>${html}</p>`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground">
          {isMarkdown ? 'Markdown' : 'Plain Text'}
          {' · '}
          {editContent.length} characters
        </span>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleCancel}
                disabled={saving}
              >
                <EyeOff className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {isEditing ? (
          <textarea
            ref={editorRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none"
            spellCheck
          />
        ) : (
          <div className="p-4">
            {isMarkdown ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                {content}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
