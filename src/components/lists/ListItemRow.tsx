'use client'

import { useState } from 'react'
import { Trash2Icon, EditIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface ListItemRowProps {
  id: string
  content: string
  isCompleted: boolean
  dueDate?: string | null
  recipeName?: string | null
  doneItemColor?: string
  category?: string
  availableCategories?: string[]
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onCategoryChange?: (id: string, newCategory: string) => void
}

export function ListItemRow({
  id,
  content,
  isCompleted,
  dueDate,
  recipeName,
  doneItemColor = 'RED',
  category,
  availableCategories = [],
  onToggle,
  onDelete,
  onCategoryChange,
}: ListItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(category || 'Other')
  const [isChanging, setIsChanging] = useState(false)

  const dueDateObj = dueDate ? new Date(dueDate) : null
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isOverdue =
    dueDateObj !== null && !isCompleted && dueDateObj < todayStart

  // Convert color string to CSS value
  const getColorValue = (color: string) => {
    const namedColors: Record<string, string> = {
      RED: '#ef4444',
      GREEN: '#22c55e',
      BLUE: '#3b82f6',
      YELLOW: '#eab308',
      PURPLE: '#a855f7',
      PINK: '#ec4899',
      ORANGE: '#f97316',
      GRAY: '#6b7280',
      BLACK: '#000000',
      WHITE: '#ffffff',
    }
    
    const upperColor = color.toUpperCase()
    if (namedColors[upperColor]) {
      return namedColors[upperColor]
    }
    
    // If it's already a hex code or valid CSS color, return as-is
    return color
  }
  
  const doneColor = getColorValue(doneItemColor)

  async function handleCategoryChange() {
    if (!onCategoryChange || selectedCategory === category) {
      setIsEditing(false)
      return
    }

    setIsChanging(true)
    try {
      await onCategoryChange(id, selectedCategory)
      setIsEditing(false)
    } catch (error) {
      toast.error('Failed to update category')
      console.error('Failed to update category:', error)
    } finally {
      setIsChanging(false)
    }
  }

  function handleCancel() {
    setSelectedCategory(category || 'Other')
    setIsEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-2 py-2 px-1 rounded-md group ${
        isCompleted ? 'opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
        aria-label={`Mark "${content}" ${isCompleted ? 'incomplete' : 'complete'}`}
        disabled={isEditing}
      />
      <span
        className={`flex-1 text-sm ${isCompleted ? 'line-through' : ''}`}
        style={isCompleted ? { color: doneColor } : undefined}
      >
        {content}
      </span>
      
      {!isCompleted && isEditing && onCategoryChange && (
        <div className="flex items-center gap-1 shrink-0">
          <Select
            value={selectedCategory}
            onValueChange={(value) => value && setSelectedCategory(value)}
            disabled={isChanging}
          >
            <SelectTrigger className="h-6 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCategories.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCategoryChange}
            disabled={isChanging || selectedCategory === category}
            className="h-5 w-5"
          >
            {isChanging ? '...' : '✓'}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCancel}
            disabled={isChanging}
            className="h-5 w-5"
          >
            ×
          </Button>
        </div>
      )}
      
      {!isCompleted && !isEditing && recipeName && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
          {recipeName}
        </span>
      )}
      {dueDateObj && !isEditing && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
            isOverdue
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
      {!isCompleted && onCategoryChange && !isEditing && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-primary"
          aria-label="Edit category"
        >
          <EditIcon className="h-3 w-3" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(id)}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Delete item"
        disabled={isEditing}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
