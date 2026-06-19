'use client'

import type { ReactNode } from 'react'
import type { DashboardCardLayout } from '@/lib/dashboard-cards'
import type { CardLayoutMap } from '@/lib/hooks/useCardLayout'
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from './ResizeHandle'

interface DashboardCardWrapperProps {
  cardId: string
  layout: DashboardCardLayout
  children: ReactNode
  isDragging: boolean
  isResizing: boolean
  isDragActive: boolean
  isResizeActive: boolean
  onDragStart: (cardId: string, e: React.PointerEvent<HTMLElement>) => void
  onResizeStart: (cardId: string, edge: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's', e: React.PointerEvent<HTMLElement>) => void
  onToggleWidth: (cardId: string) => void
  containerWidth: number
  allLayouts: CardLayoutMap
}

export function DashboardCardWrapper({
  cardId,
  layout,
  children,
  isDragActive,
  isResizeActive,
  onDragStart,
  onResizeStart,
  onToggleWidth,
  containerWidth,
}: DashboardCardWrapperProps) {
  const leftPx = (layout.x / 100) * (containerWidth || 800)
  const widthPx = (layout.width / 100) * (containerWidth || 800)
  // y is always in pixels
  const topPx = layout.y
  const heightStyle = layout.height === 'auto' ? 'auto' : `${layout.height}px`

  const zIndex = isDragActive ? 50 : isResizeActive ? 40 : 10

  const edges: Array<'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'> = [
    'se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'
  ]

  return (
    <div
      className={cn(
        'hb-dash-card',
        'absolute rounded-lg border bg-card text-card-foreground shadow-sm',
        'transition-shadow duration-200',
        isDragActive && 'shadow-xl ring-2 ring-primary/20',
        isResizeActive && 'shadow-lg ring-1 ring-primary/10',
      )}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: heightStyle,
        minHeight: '150px',
        zIndex,
      }}
    >
      {/* Drag Handle - always visible at top */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-8 flex items-center px-2',
          'cursor-grab active:cursor-grabbing',
          'rounded-t-lg bg-muted/20',
          'hover:bg-muted/30 transition-colors',
          isDragActive && 'bg-muted/40',
        )}
        onPointerDown={(e) => onDragStart(cardId, e)}
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
      </div>

      {/* Toggle Full/Half Width Button */}
      <button
        className={cn(
          'absolute top-1 right-2 z-30',
          'h-6 w-6 flex items-center justify-center',
          'rounded-md hover:bg-muted/30 transition-colors',
          'text-muted-foreground/60 hover:text-muted-foreground',
        )}
        onClick={(e) => {
          e.stopPropagation()
          onToggleWidth(cardId)
        }}
        title={layout.width >= 95 ? 'Minimise to half width' : 'Maximise to full width'}
      >
        {layout.width >= 95 ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Content Area */}
      <div className="pt-8 overflow-auto h-full">
        {children}
      </div>

      {/* Resize Handles */}
      {edges.map((edge) => (
        <ResizeHandle
          key={edge}
          edge={edge}
          onPointerDown={(e) => onResizeStart(cardId, edge, e)}
          isResizing={isResizeActive}
        />
      ))}
    </div>
  )
}
