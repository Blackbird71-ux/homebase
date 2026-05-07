'use client'

import { cn } from '@/lib/utils'

interface PanelResizeHandleProps {
  /** Index of the gap this handle sits in (between column[index] and column[index+1]) */
  index: number
  /** Whether a resize is currently active */
  isDragging: boolean
  /** Pointer event handlers from the usePanelResize hook */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

/**
 * A subtle vertical drag handle placed between dashboard panels.
 * Visible on hover and during active resize.
 */
export function PanelResizeHandle({
  index,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: PanelResizeHandleProps) {
  return (
    <div
      className={cn(
        // Position: sits between two grid columns
        'absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-col-resize',
        'group/handle'
      )}
      style={{
        // Positioned at the gap between column[index] and column[index+1]
        // The parent grid container must have position:relative for this to work.
        // We'll compute the exact left position using CSS grid's column positions.
        left: 'var(--resize-handle-left)',
      }}
    >
      {/* Visual hit area - thicker than visible for easier grabbing */}
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full transition-all duration-150',
          isDragging
            ? 'bg-primary/60 w-1.5'
            : 'bg-transparent group-hover/handle:bg-border group-hover/handle:w-1'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // Prevent text selection during drag
        style={{ touchAction: 'none' }}
      />
    </div>
  )
}
