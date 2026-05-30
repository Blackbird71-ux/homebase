'use client'

import type { AnnotationTool } from '@/types/pdf-annotations'
import {
  MousePointer2,
  Highlighter,
  Underline,
  Strikethrough,
  StickyNote,
  Pencil,
  Square,
  Circle,
  Undo2,
  Redo2,
  Save,
} from 'lucide-react'

interface AnnotationToolbarProps {
  tool: AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  color: string
  onColorChange: (color: string) => void
  opacity: number
  onOpacityChange: (opacity: number) => void
  onSave: () => void
  saving: boolean
  hasChanges: boolean
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

const COLORS = [
  '#FFEB3B', // Yellow (highlight)
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#F44336', // Red
  '#9C27B0', // Purple
  '#00BCD4', // Cyan
  '#FF5722', // Deep orange
  '#607D8B', // Blue grey
  '#000000', // Black
]

const TOOLS: { id: AnnotationTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'pan',         label: 'Select / Pan',    icon: MousePointer2 },
  { id: 'highlight',   label: 'Highlight',        icon: Highlighter },
  { id: 'underline',   label: 'Underline',        icon: Underline },
  { id: 'strikethrough', label: 'Strikethrough',   icon: Strikethrough },
  { id: 'note',        label: 'Note',             icon: StickyNote },
  { id: 'draw',        label: 'Draw',             icon: Pencil },
  { id: 'rectangle',   label: 'Rectangle',        icon: Square },
  { id: 'ellipse',     label: 'Ellipse',          icon: Circle },
]

export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  opacity,
  onOpacityChange,
  onSave,
  saving,
  hasChanges,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: AnnotationToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-card">
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              title={t.label}
              className={`p-1.5 rounded-md transition-colors ${
                tool === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Colour picker */}
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Opacity slider */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground font-medium">Opacity</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="w-16 h-1.5"
        />
      </div>

      <div className="flex-1" />

      {/* Undo / Redo */}
      {onUndo && (
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      )}
      {onRedo && (
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving || !hasChanges}
        title={hasChanges ? 'Save annotations' : 'No changes to save'}
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          hasChanges
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
