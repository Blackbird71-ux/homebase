'use client'

import { useState } from 'react'
import { Trash2Icon, EditIcon, LockIcon, LockOpenIcon, DollarSignIcon, UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { dateStringInTz, formatInTz, DEFAULT_TIMEZONE } from '@/lib/timezone'

interface ListItemRowProps {
  id: string
  content: string
  isCompleted: boolean
  isLocked?: boolean
  dueDate?: string | null
  /** Family timezone — used to decide "overdue" against local today. Defaults to DEFAULT_TIMEZONE. */
  timezone?: string
  recipeName?: string | null
  showRecipePills?: boolean
  doneItemColor?: string
  category?: string
  availableCategories?: string[]
  assignedToUserId?: string | null
  members?: { id: string; name: string }[]
  onToggle: (id: string, isCompleted: boolean) => void
  onDelete: (id: string) => void
  onToggleLock?: (id: string, isLocked: boolean) => void
  onCategoryChange?: (id: string, newCategory: string) => void
  onEdit?: (id: string) => void
  onAssign?: (id: string, assignedToUserId: string | null) => void
}

export function ListItemRow({
  id,
  content,
  isCompleted,
  isLocked = false,
  dueDate,
  timezone = DEFAULT_TIMEZONE,
  recipeName,
  showRecipePills = false,
  doneItemColor = 'RED',
  category,
  availableCategories = [],
  assignedToUserId,
  members = [],
  onToggle,
  onDelete,
  onToggleLock,
  onCategoryChange,
  onEdit,
  onAssign,
}: ListItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(category || 'Other')
  const [isChanging, setIsChanging] = useState(false)

  const dueDateObj = dueDate ? new Date(dueDate) : null
  // Due dates are stored as UTC midnight of the calendar date, so read the stored
  // day in UTC and compare it to today in the family timezone — the overdue flag
  // flips at local midnight, not the device's midnight.
  const isOverdue =
    dueDateObj !== null &&
    !isCompleted &&
    dateStringInTz(dueDateObj, 'UTC') < dateStringInTz(new Date(), timezone)

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
    if (namedColors[upperColor]) return namedColors[upperColor]
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
      className={`flex items-center gap-2 py-1.5 px-1 rounded-md group ${
        isCompleted ? 'opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="h-5 w-5 cursor-pointer shrink-0 accent-primary"
        aria-label={`Mark "${content}" ${isCompleted ? 'incomplete' : 'complete'}`}
        disabled={isEditing}
      />
      <button
        onDoubleClick={() => !isCompleted && !isLocked && onEdit?.(id)}
        className={`flex-1 min-w-0 text-left ${!isCompleted && !isLocked && onEdit ? 'cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1' : ''}`}
        style={isCompleted ? { color: doneColor } : undefined}
        disabled={isCompleted || isLocked}
        aria-label={`Edit "${content}"`}
        type="button"
      >
        <span className={`text-sm block ${isCompleted ? 'line-through' : ''}`}>{content}</span>
        {!isCompleted && recipeName && showRecipePills && (
          <span className="inline-flex text-xs leading-none px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium mt-0.5">
            {recipeName}
          </span>
        )}
        {!isCompleted && recipeName && !showRecipePills && (
          <span className="text-xs text-primary block mt-0.5">{recipeName}</span>
        )}
      </button>

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

      {dueDateObj && !isEditing && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
            isOverdue
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {formatInTz(dueDateObj, 'UTC', { month: 'short', day: 'numeric' })}
        </span>
      )}

      {/* Assignee badge / dropdown */}
      {!isCompleted && members.length > 0 && onAssign && (
        <div className="relative shrink-0">
          {assignedToUserId ? (
            <button
              type="button"
              onClick={() => onAssign(id, null)}
              className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title={`Assigned to ${members.find(m => m.id === assignedToUserId)?.name ?? 'Unknown'} — click to unassign`}
            >
              <UserIcon className="h-2.5 w-2.5" />
              {members.find(m => m.id === assignedToUserId)?.name ?? 'Unknown'}
            </button>
          ) : (
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value
                if (val) onAssign(id, val)
              }}
              className="h-6 text-xs rounded-full border border-input bg-transparent px-1.5 text-muted-foreground hover:text-foreground appearance-none cursor-pointer opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              aria-label="Assign to"
            >
              <option value="">Assign</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Lock button — visible on hover or when locked */}
      {onToggleLock && !isEditing && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onToggleLock(id, !isLocked)}
          className={`shrink-0 ${
            isLocked
              ? 'opacity-100 text-yellow-500 hover:text-yellow-600'
              : 'flex md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-yellow-500'
          }`}
          aria-label={isLocked ? 'Unlock item' : 'Lock item'}
          title={isLocked ? 'Unlock item' : 'Lock item (prevents deletion)'}
        >
          {isLocked
            ? <LockIcon className="h-3.5 w-3.5 fill-yellow-500" />
            : <LockOpenIcon className="h-3.5 w-3.5" />
          }
        </Button>
      )}

      {!isCompleted && onCategoryChange && !isEditing && !isLocked && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsEditing(true)}
          className="hidden md:flex md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-primary"
          aria-label="Edit category"
        >
          <EditIcon className="h-3 w-3" />
        </Button>
      )}

      {/* Delete button — hidden when locked */}
      {!isLocked && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(id)}
          className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Delete item"
          disabled={isEditing}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
