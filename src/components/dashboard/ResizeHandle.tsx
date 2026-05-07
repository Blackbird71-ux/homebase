'use client'

import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  edge: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  isResizing?: boolean
}

const EDGE_CLASSES: Record<string, string> = {
  se: 'bottom-0 right-0 cursor-se-resize',
  sw: 'bottom-0 left-0 cursor-sw-resize',
  ne: 'top-0 right-0 cursor-ne-resize',
  nw: 'top-0 left-0 cursor-nw-resize',
  e: 'top-0 bottom-0 right-0 cursor-e-resize',
  w: 'top-0 bottom-0 left-0 cursor-w-resize',
  n: 'left-0 right-0 top-0 cursor-n-resize',
  s: 'left-0 right-0 bottom-0 cursor-s-resize',
}

const SIZE_CLASSES: Record<string, string> = {
  se: 'h-3 w-3',
  sw: 'h-3 w-3',
  ne: 'h-3 w-3',
  nw: 'h-3 w-3',
  e: 'w-1.5 h-full',
  w: 'w-1.5 h-full',
  n: 'h-1.5 w-full',
  s: 'h-1.5 w-full',
}

export function ResizeHandle({
  edge,
  onPointerDown,
  isResizing,
}: ResizeHandleProps) {
  const isCorner = edge.length === 2

  return (
    <div
      className={cn(
        'absolute z-20 touch-none',
        EDGE_CLASSES[edge],
        SIZE_CLASSES[edge],
        // Corner handles get a visible grip area
        isCorner && [
          'flex items-center justify-center',
          'before:absolute before:inset-0 before:rounded-full before:opacity-0 before:transition-opacity',
          'hover:before:opacity-100 hover:before:bg-primary/20',
          isResizing && 'before:opacity-100 before:bg-primary/30',
        ],
        // Edge handles get a thin visible line on hover
        !isCorner && [
          'hover:bg-primary/10',
          isResizing && 'bg-primary/15',
        ],
        // Corner grip icon indicator
        edge === 'se' && 'after:absolute after:bottom-0.5 after:right-0.5 after:h-2 after:w-2 after:border-r after:border-b after:border-muted-foreground/40 after:rounded-br-sm',
      )}
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none' }}
    />
  )
}
