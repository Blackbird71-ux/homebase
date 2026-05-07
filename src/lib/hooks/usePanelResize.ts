'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PanelSizes {
  /** Fractional values representing each column's width (e.g., [1, 1] for equal). */
  fractions: number[]
}

const MIN_FRACTION = 0.35 // minimum column width as fraction of total
const MAX_FRACTION = 0.75 // maximum column width as fraction of total

/**
 * A hook that enables drag-to-resize between columns in a multi-column grid.
 *
 * Returns:
 *  - sizes: the current fractions for each column
 *  - getResizeProps(index): props to spread on a resize handle between col[index] and col[index+1]
 *  - setSizes: direct setter (useful when restoring saved sizes)
 *  - isDragging: whether a resize is currently in progress
 */
export function usePanelResize(columnCount: number, initialFractions?: number[]) {
  const [sizes, setSizes] = useState<number[]>(() => {
    if (initialFractions && initialFractions.length === columnCount) {
      return initialFractions
    }
    // Default to equal columns
    return Array.from({ length: columnCount }, () => 1)
  })

  const draggingRef = useRef<{
    handleIndex: number
    startX: number
    startSizes: number[]
    containerWidth: number
  } | null>(null)

  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>) => {
      // Only left mouse button or touch
      if (e.button !== 0 && e.pointerType === 'mouse') return

      e.preventDefault()
      e.stopPropagation()

      const container = (e.currentTarget as HTMLElement).parentElement
      if (!container) return

      const containerWidth = container.getBoundingClientRect().width

      draggingRef.current = {
        handleIndex: index,
        startX: e.clientX,
        startSizes: [...sizes],
        containerWidth,
      }
      setIsDragging(true)

      // Capture pointer for smooth drag
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [sizes]
  )

  // Use a ref for the move handler to avoid stale closures while keeping it stable
  const handlePointerMoveRef = useRef((_e: PointerEvent) => {})

  // This effect registers a window-level pointermove listener when dragging,
  // and removes it when done. This ensures moves are captured even when the
  // pointer leaves the handle element during fast drags.
  useEffect(() => {
    handlePointerMoveRef.current = (e: PointerEvent) => {
      const drag = draggingRef.current
      if (!drag) return

      const deltaX = e.clientX - drag.startX
      const fractionDelta = deltaX / drag.containerWidth

      const leftSize = drag.startSizes[drag.handleIndex]
      const rightSize = drag.startSizes[drag.handleIndex + 1]

      let newLeft = leftSize + fractionDelta
      let newRight = rightSize - fractionDelta

      // Clamp to min/max
      if (newLeft < MIN_FRACTION) {
        newRight += newLeft - MIN_FRACTION
        newLeft = MIN_FRACTION
      }
      if (newRight < MIN_FRACTION) {
        newLeft += newRight - MIN_FRACTION
        newRight = MIN_FRACTION
      }
      if (newLeft > MAX_FRACTION) {
        newRight += newLeft - MAX_FRACTION
        newLeft = MAX_FRACTION
      }
      if (newRight > MAX_FRACTION) {
        newLeft += newRight - MAX_FRACTION
        newRight = MAX_FRACTION
      }

      const newSizes = [...drag.startSizes]
      newSizes[drag.handleIndex] = Math.max(MIN_FRACTION, newLeft)
      newSizes[drag.handleIndex + 1] = Math.max(MIN_FRACTION, newRight)

      setSizes(newSizes)
    }
  }, [])

  // Window-level pointermove listener — fires even when pointer leaves the handle
  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      handlePointerMoveRef.current(e)
    }

    const onUp = () => {
      draggingRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDragging])

  const getResizeProps = useCallback(
    (index: number) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => handlePointerDown(index, e),
      'data-resize-handle': true,
      'data-resize-index': index,
    }),
    [handlePointerDown]
  )

  return {
    sizes,
    setSizes,
    getResizeProps,
    isDragging,
  }
}
