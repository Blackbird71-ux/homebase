'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BoldIcon, ItalicIcon, ListIcon, ListOrderedIcon, XIcon, TagIcon } from 'lucide-react'

interface NoteEditorProps {
  initialTitle?: string
  initialContent?: string
  initialCategory?: string | null
  initialTags?: string[]
  categories?: string[]
  onSubmit: (data: {
    title: string
    content: string
    category?: string | null
    tags?: string[]
  }) => void
  onCancel?: () => void
  isLoading?: boolean
}

export function NoteEditor({
  initialTitle = '',
  initialContent = '',
  initialCategory = null,
  initialTags = [],
  categories = [],
  onSubmit,
  onCancel,
  isLoading = false,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [newTag, setNewTag] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      title,
      content,
      category: category || null,
      tags: tags.length > 0 ? tags : undefined,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit(e)
    }
  }

  const applyFormatting = (format: string) => {
    const textarea = document.activeElement as HTMLTextAreaElement
    if (!textarea || textarea.tagName !== 'TEXTAREA') return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    let newText = content
    let replacement = ''

    switch (format) {
      case 'bold':
        replacement = `<strong>${selectedText}</strong>`
        break
      case 'italic':
        replacement = `<em>${selectedText}</em>`
        break
      case 'bullet':
        replacement = `\n• ${selectedText}`
        break
      case 'numbered':
        replacement = `\n1. ${selectedText}`
        break
    }

    newText = content.substring(0, start) + replacement + content.substring(end)
    setContent(newText)
    
    // Focus back on textarea and set cursor position
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + replacement.length, start + replacement.length)
    }, 0)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" onKeyDown={handleKeyDown}>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">Content</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => applyFormatting('bold')}
              title="Bold (Ctrl+B)"
            >
              <BoldIcon className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => applyFormatting('italic')}
              title="Italic (Ctrl+I)"
            >
              <ItalicIcon className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => applyFormatting('bullet')}
              title="Bullet list"
            >
              <ListIcon className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => applyFormatting('numbered')}
              title="Numbered list"
            >
              <ListOrderedIcon className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <textarea
          id="content"
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
          placeholder="Note content (supports basic HTML formatting)"
          rows={10}
          required
          disabled={isLoading}
          className="w-full min-h-[200px] px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Supports basic HTML formatting
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={category || ''}
            onValueChange={(value: string | null) => setCategory(value || null)}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No category</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
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
          <Label htmlFor="tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
            />
            <Button type="button" onClick={addTag} disabled={isLoading}>
              Add
            </Button>
          </div>
          
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <div
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-full"
                >
                  <TagIcon className="h-3 w-3" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 hover:text-destructive"
                    disabled={isLoading}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Note'}
        </Button>
      </div>
    </form>
  )
}