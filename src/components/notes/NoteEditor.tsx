'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ColorPicker } from '@/components/ui/color-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BoldIcon, ItalicIcon, XIcon, LockIcon, UsersIcon, ArchiveIcon, BaselineIcon, HighlighterIcon, RemoveFormattingIcon, PaletteIcon } from 'lucide-react'
import { NoteEditorToolbar } from './NoteEditorToolbar'

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
]

interface NoteEditorProps {
  initialTitle?: string
  initialContent?: string
  initialCategory?: string | null
  initialTags?: string[]
  initialIsPrivate?: boolean
  initialIsArchived?: boolean
  initialPinHash?: string | null
  categories?: string[]
  tagColors?: Record<string, string>
  onSubmit: (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
    newTagColors?: Record<string, string>
    isPrivate?: boolean
    isArchived?: boolean
    pin?: string | null
  }) => void

  onCancel?: () => void
  isLoading?: boolean
}

export function NoteEditor({
  initialTitle = '',
  initialContent = '',
  initialCategory = null,
  initialTags = [],
  initialIsPrivate = false,
  initialIsArchived = false,
  initialPinHash = null,
  categories = [],
  tagColors,
  onSubmit,
  onCancel,
  isLoading = false,
}: NoteEditorProps) {
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [newTag, setNewTag] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')
  const [pendingTagColors, setPendingTagColors] = useState<Record<string, string>>({})
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate)
  const [isArchived, setIsArchived] = useState(initialIsArchived)
  const [pinCode, setPinCode] = useState('')
  const [hasPin, setHasPin] = useState(!!initialPinHash)
  const [textColor, setTextColor] = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')
  const titleRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const savedEditableRef = useRef<HTMLDivElement | null>(null)

  // Initialise editor content once on mount
  useEffect(() => {
    if (titleRef.current && initialTitle) {
      titleRef.current.innerHTML = initialTitle
    }
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const exec = useCallback((command: string, value?: string) => {
    const active = document.activeElement
    document.execCommand(command, false, value)
    // Re-focus whichever editable was active (e.preventDefault() on toolbar buttons
    // keeps focus in place, but some commands or prompts can blur it)
    if (active === titleRef.current || active === editorRef.current) {
      ;(active as HTMLDivElement).focus()
    } else {
      editorRef.current?.focus()
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const titleHtml = titleRef.current?.innerHTML ?? ''
    if (!titleHtml.replace(/<[^>]*>/g, '').trim()) {
      titleRef.current?.focus()
      return
    }
    const content = editorRef.current?.innerHTML ?? ''
    onSubmit({
      title: titleHtml,
      content,
      category: category || null,
      tags: tags.length > 0 ? tags : undefined,
      newTagColors: Object.keys(pendingTagColors).length > 0 ? pendingTagColors : undefined,
      isPrivate,
      isArchived,
      pin: hasPin && pinCode ? pinCode : undefined,
    })
  }


  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      // Save the chosen color for this new tag
      setPendingTagColors(prev => ({ ...prev, [newTag.trim()]: newTagColor }))
      setNewTag('')
      setNewTagColor('#6366f1')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://')
    if (url) exec('createLink', url)
  }

  const insertImage = () => {
    const url = prompt('Enter image URL:', 'https://')
    if (url) {
      // Use execCommand to insert the image at the cursor position
      exec('insertImage', url)
    }
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      // Track which editable had focus so we can re-focus it before execCommand
      savedEditableRef.current =
        document.activeElement === titleRef.current ? titleRef.current : editorRef.current
    }
  }

  const restoreSelection = () => {
    // Must focus the owning editable first — execCommand requires an active editable
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Title */}
      <div className="space-y-1">
        <Label onClick={() => titleRef.current?.focus()}>Title</Label>
        <div
          ref={titleRef}
          contentEditable={!isLoading}
          suppressContentEditableWarning
          data-placeholder="Note title…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
            if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e)
          }}
          className="w-full min-h-[2.25rem] rounded-t-md border border-input border-b-0 bg-background px-3 py-2 text-sm font-semibold ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {/* Title formatting strip */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 border border-input rounded-b-md bg-muted/40">
          {(['bold', 'italic'] as const).map((cmd) => {
            const Icon = cmd === 'bold' ? BoldIcon : ItalicIcon
            return (
              <button
                key={cmd}
                type="button"
                title={cmd === 'bold' ? 'Bold (Ctrl+B)' : 'Italic (Ctrl+I)'}
                onMouseDown={(e) => { e.preventDefault(); exec(cmd) }}
                className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
                disabled={isLoading}
              >
                <Icon className="h-3 w-3" />
              </button>
            )
          })}
          <div className="w-px h-4 bg-border mx-0.5" />
          {/* Text colour — triggers the same hidden input as the main toolbar */}
          <button
            type="button"
            title="Text colour"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); textColorInputRef.current?.click() }}
            className="h-6 w-6 flex flex-col items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            <BaselineIcon className="h-3 w-3" />
            <span className="block h-[2px] w-3 rounded-full" style={{ backgroundColor: textColor }} />
          </button>
          {/* Highlight — same */}
          <button
            type="button"
            title="Highlight colour"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); highlightColorInputRef.current?.click() }}
            className="h-6 w-6 flex flex-col items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            <HighlighterIcon className="h-3 w-3" />
            <span className="block h-[2px] w-3 rounded-full" style={{ backgroundColor: highlightColor }} />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            type="button"
            title="Clear title formatting"
            onMouseDown={(e) => { e.preventDefault(); exec('removeFormat') }}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            <RemoveFormattingIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Rich Text Editor */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <Label>Content</Label>
        </div>

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
          isLoading={isLoading}
        />

        {/* Editor area — this is the only scrollable part of the dialog */}
        <div
          ref={editorRef}
          contentEditable={!isLoading}
          suppressContentEditableWarning
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e)
          }}
          className="min-h-[160px] overflow-y-auto px-4 py-3 border border-input border-t-0 rounded-b-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 prose prose-sm dark:prose-invert max-w-none"
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
          [contenteditable] img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.5em 0; }
        `}</style>
      </div>

      {/* Save / Cancel — at the top so you don't have to scroll past content */}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save Note'}
        </Button>
      </div>

      {/* Category + Tags + Visibility + PIN — fixed, no scroll */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <div className="flex-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag() }
                }}
              />
              {/* Color picker — shown when user is typing a new tag */}
              {newTag.trim() && (
                <div className="mt-1.5 space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <PaletteIcon className="h-3 w-3" />
                    Choose tag colour:
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewTagColor(color)}
                        className={`w-5 h-5 rounded-full border transition-all ${
                          newTagColor === color
                            ? 'border-white scale-110 ring-1 ring-offset-1 ring-foreground'
                            : 'border-transparent hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <ColorPicker
                      value={newTagColor}
                      onChange={setNewTagColor}
                    />
                  </div>
                </div>
              )}
            </div>
            <Button type="button" onClick={addTag} disabled={isLoading || !newTag.trim()}>Add</Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => {
                // Use pending tag color first (if just added in this session), then existing color
                const color = pendingTagColors[tag] || tagColors?.[tag]
                return (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full font-medium"
                    style={{
                      backgroundColor: color ? `${color}20` : undefined,
                      color: color || undefined,
                      borderColor: color || undefined,
                    }}
                  >
                    {color && (
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive" disabled={isLoading}>
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {/* Existing tags selector */}
          {tagColors && Object.keys(tagColors).length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Existing tags — click to add:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(tagColors)
                  .filter(([tagName]) => !tags.includes(tagName))
                  .slice(0, 20)
                  .map(([tagName, color]) => (
                    <button
                      key={tagName}
                      type="button"
                      onClick={() => {
                        if (!tags.includes(tagName)) {
                          setTags([...tags, tagName])
                        }
                      }}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium transition-colors hover:opacity-80 border border-input"
                      style={{
                        backgroundColor: color ? `${color}15` : undefined,
                        color: color || undefined,
                      }}
                    >
                      {color && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {tagName}
                    </button>
                  ))}
                {Object.keys(tagColors).filter(t => !tags.includes(t)).length > 20 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{Object.keys(tagColors).filter(t => !tags.includes(t)).length - 20} more
                  </span>
                )}
              </div>
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

      {/* Archive toggle */}
      <div className="flex items-center gap-3 p-3 border border-input rounded-md bg-muted/30">
        <button
          type="button"
          onClick={() => setIsArchived(!isArchived)}
          disabled={isLoading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
            isArchived ? 'bg-gray-500' : 'bg-muted-foreground/30'
          }`}
          aria-checked={!isArchived}
          role="switch"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isArchived ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <div className="flex items-center gap-2">
          {isArchived ? (
            <>
              <ArchiveIcon className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Archived note</p>
                <p className="text-xs text-muted-foreground">Hidden from main view, visible in Archived tab</p>
              </div>
            </>
          ) : (
            <>
              <ArchiveIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Archive note</p>
                <p className="text-xs text-muted-foreground">Keep for reference, hide from active tabs</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PIN Protection */}
      <div className="p-3 border border-input rounded-md bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LockIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">PIN Protection</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setHasPin(!hasPin)
              if (hasPin) setPinCode('')
            }}
            disabled={isLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              hasPin ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            aria-checked={hasPin}
            role="switch"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              hasPin ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {hasPin && (
          <div className="mt-3 space-y-2">
            <Label htmlFor="note-pin">
              {initialPinHash ? 'Enter new PIN (leave blank to keep current)' : 'Set a 4-6 digit PIN'}
            </Label>
            <Input
              id="note-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter PIN"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              A PIN must be entered to view this note's content.
            </p>
          </div>
        )}
      </div>

    </form>
  )
}