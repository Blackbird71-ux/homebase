'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  ListIcon, ListOrderedIcon, XIcon, TagIcon, LinkIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon, LockIcon, UsersIcon,
  Heading1Icon, Heading2Icon, Heading3Icon, TypeIcon,
  BaselineIcon, HighlighterIcon, RemoveFormattingIcon,
} from 'lucide-react'

interface NoteEditorProps {
  initialTitle?: string
  initialContent?: string
  initialCategory?: string | null
  initialTags?: string[]
  initialIsPrivate?: boolean
  categories?: string[]
  onSubmit: (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    isPrivate?: boolean
  }) => void
  onCancel?: () => void
  isLoading?: boolean
}

const FONT_SIZES = [
  { label: 'Small', value: '0.875em' },
  { label: 'Normal', value: '1em' },
  { label: 'Large', value: '1.25em' },
  { label: 'XL', value: '1.5em' },
  { label: '2XL', value: '2em' },
]

export function NoteEditor({
  initialTitle = '',
  initialContent = '',
  initialCategory = null,
  initialTags = [],
  initialIsPrivate = false,
  categories = [],
  onSubmit,
  onCancel,
  isLoading = false,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [newTag, setNewTag] = useState('')
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate)
  const [textColor, setTextColor] = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')
  const [fontSizeKey, setFontSizeKey] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)

  // Initialise editor content once on mount
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const content = editorRef.current?.innerHTML ?? ''
    onSubmit({
      title,
      content,
      category: category || null,
      tags: tags.length > 0 ? tags : undefined,
      isPrivate,
    })
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://')
    if (url) exec('createLink', url)
  }

  const setFontSize = (size: string) => {
    // execCommand fontSize only accepts 1-7; use a span workaround
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) {
      const span = document.createElement('span')
      span.style.fontSize = size
      range.surroundContents(span)
      sel.removeAllRanges()
    }
    editorRef.current?.focus()
    // Reset dropdown to placeholder
    setFontSizeKey(k => k + 1)
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
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

  const ToolButton = ({
    onClick, title: tip, active, children,
  }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      title={tip}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors
        ${ active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'
        } disabled:opacity-50`}
      disabled={isLoading}
    >
      {children}
    </button>
  )

  // Color picker button: shows icon + swatch of last-used color.
  // Saves selection on mousedown so the color picker can restore it on change.
  const ColorButton = ({
    inputRef, color, title: tip, onColorChange, children,
  }: {
    inputRef: React.RefObject<HTMLInputElement | null>
    color: string
    title: string
    onColorChange: (c: string) => void
    children: React.ReactNode
  }) => (
    <div className="relative">
      <button
        type="button"
        title={tip}
        onMouseDown={(e) => { e.preventDefault(); saveSelection(); inputRef.current?.click() }}
        className="h-7 w-7 flex flex-col items-center justify-center gap-0 rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
        disabled={isLoading}
      >
        {children}
        <span className="block h-[3px] w-4 rounded-full mt-0.5" style={{ backgroundColor: color }} />
      </button>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          required
          disabled={isLoading}
        />
      </div>

      {/* Rich Text Editor */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Content</Label>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 p-1.5 border border-input rounded-t-md bg-muted/40">
          {/* Headings */}
          <ToolButton onClick={() => exec('formatBlock', 'h1')} title="Heading 1">
            <Heading1Icon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('formatBlock', 'h2')} title="Heading 2">
            <Heading2Icon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('formatBlock', 'h3')} title="Heading 3">
            <Heading3Icon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('formatBlock', 'p')} title="Normal text">
            <TypeIcon className="h-3.5 w-3.5" />
          </ToolButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Font size */}
          <select
            key={fontSizeKey}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => { if (e.target.value) setFontSize(e.target.value) }}
            className="h-7 text-xs rounded border border-input bg-background px-1 text-muted-foreground cursor-pointer"
            defaultValue=""
            disabled={isLoading}
            title="Font size"
          >
            <option value="" disabled>Size</option>
            {FONT_SIZES.map(fs => (
              <option key={fs.value} value={fs.value}>{fs.label}</option>
            ))}
          </select>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Inline styles */}
          <ToolButton onClick={() => exec('bold')} title="Bold (Ctrl+B)">
            <BoldIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('italic')} title="Italic (Ctrl+I)">
            <ItalicIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('underline')} title="Underline (Ctrl+U)">
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('strikeThrough')} title="Strikethrough">
            <StrikethroughIcon className="h-3.5 w-3.5" />
          </ToolButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Alignment */}
          <ToolButton onClick={() => exec('justifyLeft')} title="Align left">
            <AlignLeftIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('justifyCenter')} title="Align centre">
            <AlignCenterIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('justifyRight')} title="Align right">
            <AlignRightIcon className="h-3.5 w-3.5" />
          </ToolButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Lists */}
          <ToolButton onClick={() => exec('insertUnorderedList')} title="Bullet list">
            <ListIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton onClick={() => exec('insertOrderedList')} title="Numbered list">
            <ListOrderedIcon className="h-3.5 w-3.5" />
          </ToolButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Link */}
          <ToolButton onClick={insertLink} title="Insert link">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Text colour */}
          <ColorButton
            inputRef={textColorInputRef}
            color={textColor}
            title="Text colour"
            onColorChange={applyTextColor}
          >
            <BaselineIcon className="h-3.5 w-3.5" />
          </ColorButton>

          {/* Highlight */}
          <ColorButton
            inputRef={highlightColorInputRef}
            color={highlightColor}
            title="Highlight colour"
            onColorChange={applyHighlightColor}
          >
            <HighlighterIcon className="h-3.5 w-3.5" />
          </ColorButton>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Clear formatting */}
          <ToolButton onClick={() => exec('removeFormat')} title="Clear formatting">
            <RemoveFormattingIcon className="h-3.5 w-3.5" />
          </ToolButton>
        </div>

        {/* Editor area */}
        <div
          ref={editorRef}
          contentEditable={!isLoading}
          suppressContentEditableWarning
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e)
          }}
          className="min-h-[280px] max-h-[500px] overflow-y-auto px-4 py-3 border border-input border-t-0 rounded-b-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 prose prose-sm dark:prose-invert max-w-none"
          data-placeholder="Start writing your note…"
          style={{ whiteSpace: 'pre-wrap' } as React.CSSProperties}
        />
        <style>{`
          [contenteditable]:empty:before {
            content: attr(data-placeholder);
            color: hsl(var(--muted-foreground));
            pointer-events: none;
          }
          [contenteditable] h1 { font-size: 1.75rem; font-weight: 700; margin: 0.5em 0; }
          [contenteditable] h2 { font-size: 1.4rem;  font-weight: 600; margin: 0.5em 0; }
          [contenteditable] h3 { font-size: 1.15rem; font-weight: 600; margin: 0.5em 0; }
          [contenteditable] ul { list-style: disc;    padding-left: 1.5em; margin: 0.25em 0; }
          [contenteditable] ol { list-style: decimal; padding-left: 1.5em; margin: 0.25em 0; }
          [contenteditable] a  { color: hsl(var(--primary)); text-decoration: underline; }
        `}</style>
      </div>

      {/* Category + Tags + Visibility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={category || ''}
            onValueChange={(value) => setCategory(value || null)}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No category</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or enter new category"
            value={category && !categories.includes(category) ? category : ''}
            onChange={(e) => setCategory(e.target.value || null)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag() }
              }}
            />
            <Button type="button" onClick={addTag} disabled={isLoading}>Add</Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <div key={tag} className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full">
                  <TagIcon className="h-3 w-3" />
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive" disabled={isLoading}>
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visibility toggle */}
      <div className="flex items-center gap-3 p-3 border border-input rounded-md bg-muted/30">
        <button
          type="button"
          onClick={() => setIsPrivate(!isPrivate)}
          disabled={isLoading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
            isPrivate ? 'bg-amber-500' : 'bg-primary'
          }`}
          aria-checked={!isPrivate}
          role="switch"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isPrivate ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <div className="flex items-center gap-2">
          {isPrivate ? (
            <>
              <LockIcon className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Private note</p>
                <p className="text-xs text-muted-foreground">Only visible to you</p>
              </div>
            </>
          ) : (
            <>
              <UsersIcon className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Family note</p>
                <p className="text-xs text-muted-foreground">Visible to all family members</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save Note'}
        </Button>
      </div>
    </form>
  )
}