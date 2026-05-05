'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface TagWithCount {
  id: string
  name: string
  recipeCount: number
  color?: string | null
}

interface TagCloudProps {
  selectedTag?: string | null
  onTagClick?: (tag: string | null) => void
  maxTags?: number
  showCounts?: boolean
}

export function TagCloud({ selectedTag, onTagClick, maxTags = 20, showCounts = true }: TagCloudProps) {
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTags()
  }, [])

  async function fetchTags() {
    try {
      setLoading(true)
      const res = await fetch('/api/tags?includeCounts=true')
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json()
      // Sort by count descending, then by name
      const sorted = data.sort((a: TagWithCount, b: TagWithCount) => {
        if (b.recipeCount !== a.recipeCount) {
          return b.recipeCount - a.recipeCount
        }
        return a.name.localeCompare(b.name)
      })
      setTags(sorted.slice(0, maxTags))
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No tags yet. Add tags to recipes to see them here.
      </div>
    )
  }

  // Calculate size ranges based on counts
  const counts = tags.map(t => t.recipeCount)
  const maxCount = Math.max(...counts)
  const minCount = Math.min(...counts)

  function getSizeClass(count: number) {
    if (maxCount === minCount) return 'text-sm'
    
    const range = maxCount - minCount
    const normalized = (count - minCount) / range
    
    if (normalized > 0.8) return 'text-lg font-semibold'
    if (normalized > 0.6) return 'text-base font-medium'
    if (normalized > 0.4) return 'text-base'
    if (normalized > 0.2) return 'text-sm'
    return 'text-xs'
  }

  function getVariant(count: number) {
    if (maxCount === minCount) return 'outline'
    
    const range = maxCount - minCount
    const normalized = (count - minCount) / range
    
    if (normalized > 0.8) return 'default'
    if (normalized > 0.6) return 'secondary'
    return 'outline'
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Button
          key={tag.id}
          variant={selectedTag === tag.name ? 'default' : getVariant(tag.recipeCount)}
          size="sm"
          className={getSizeClass(tag.recipeCount)}
          onClick={() => onTagClick?.(selectedTag === tag.name ? null : tag.name)}
          style={tag.color && selectedTag !== tag.name ? {
            borderColor: `${tag.color}40`,
          } : undefined}
        >
          {tag.color && (
            <span
              className="inline-block w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: tag.color }}
            />
          )}
          {tag.name}
          {showCounts && (
            <span className="ml-1.5 text-xs opacity-70">
              {tag.recipeCount}
            </span>
          )}
        </Button>
      ))}
    </div>
  )
}