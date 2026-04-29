'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { XIcon, PlusIcon, Loader2 } from 'lucide-react'

interface Tag {
  id: string
  name: string
}

interface TagSelectorProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function TagSelector({ value, onChange, placeholder = 'Add tags...', disabled = false }: TagSelectorProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const insideContainer = containerRef.current?.contains(target)
      const insideDropdown = dropdownRef.current?.contains(target)
      if (!insideContainer && !insideDropdown) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!inputValue.trim()) {
      fetchAllTags()
    } else {
      fetchSuggestions(inputValue)
    }
  }, [inputValue])

  function updateDropdownPosition() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }

  useEffect(() => {
    if (showSuggestions) updateDropdownPosition()
  }, [showSuggestions, suggestions, loading, inputValue])

  async function fetchAllTags() {
    setLoading(true)
    try {
      const res = await fetch('/api/tags')
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      setSuggestions(data.filter((tag: Tag) => !value.includes(tag.name)))
    } catch (error) {
      console.error('Failed to fetch tags:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSuggestions(query: string) {
    if (!query.trim()) {
      fetchAllTags()
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/tags?search=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      setSuggestions(data.filter((tag: Tag) => !value.includes(tag.name)))
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  function handleAddTag(tagName: string) {
    const trimmed = tagName.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInputValue('')
    setShowSuggestions(false)
  }

  function handleRemoveTag(tagName: string) {
    onChange(value.filter(t => t !== tagName))
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      handleAddTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      handleRemoveTag(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  function handleInputFocus() {
    setShowSuggestions(true)
    updateDropdownPosition()
  }

  const showDropdown = showSuggestions && (suggestions.length > 0 || loading || !!inputValue.trim())

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>Tags</Label>
      <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[42px]">
        {value.map((tag) => (
          <div
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-md"
          >
            <span>{tag}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-primary/20"
              onClick={() => handleRemoveTag(tag)}
              disabled={disabled}
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex-1 min-w-[120px]">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={handleInputFocus}
            placeholder={value.length === 0 ? placeholder : 'Add more tags...'}
            disabled={disabled}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Type and press Enter to add a tag, or pick from the list.
      </p>

      {mounted && showDropdown && dropdownRect && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownRect.top,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
          className="bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAddTag(tag.name)}
              >
                {tag.name}
              </button>
            ))
          )}
          {inputValue.trim() && !suggestions.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase()) && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAddTag(inputValue)}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create "{inputValue.trim()}"
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
