'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardCardLayout } from '@/lib/dashboard-cards'

export const MIN_WIDTH_PCT = 25
const MIN_HEIGHT_PX = 150
const GAP_PX = 16

export interface CardLayoutMap {
  [cardId: string]: DashboardCardLayout
}

interface DragState {
  cardId: string
  startMouseX: number
  startMouseY: number
  startLayout: DashboardCardLayout
  containerWidth: number
  containerHeight: number
}

interface ResizeState {
  cardId: string
  startMouseX: number
  startMouseY: number
  startLayout: DashboardCardLayout
  containerWidth: number
  containerHeight: number
  edge: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'
}

/**
 * A hook that manages free-form card layouts on the dashboard.
 * Supports drag-to-move, drag-to-resize, collision push, and persistence.
 */
export function useCardLayout(
  initialLayouts: CardLayoutMap,
  cardIds: string[],
  onSave?: (layouts: CardLayoutMap) => void
) {
  const [layouts, setLayouts] = useState<CardLayoutMap>(() => {
    // Auto-position any cards that don't have a layout yet
    const result: CardLayoutMap = { ...initialLayouts }
    let autoIndex = 0
    for (const id of cardIds) {
      if (!result[id]) {
        // Place at default positions: alternating left/right columns
        const col = autoIndex % 2
        const row = Math.floor(autoIndex / 2)
        result[id] = {
          x: col === 0 ? 0 : 52,
          y: row * 35,
          width: 48,
          height: 'auto',
        }
        autoIndex++
      }
    }
    return result
  })

  const draggingRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragCardId, setDragCardId] = useState<string | null>(null)

  const resizingRef = useRef<ResizeState | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeCardId, setResizeCardId] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // Persist debounced
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (onSave) {
        onSave(layoutsRef.current)
      }
    }, 500)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
    // We only want to trigger on layout changes, not onSave reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts])

  // ─── Collision / Push Logic ──────────────────────────────────────────

  /**
   * Get the bounding rect for a card layout in pixels.
   */
  const getBoundingBox = useCallback(
    (layout: DashboardCardLayout, containerW: number, containerH: number) => {
      const wPx = (layout.width / 100) * containerW
      const hPx = layout.height === 'auto' ? 300 : layout.height
      return {
        left: (layout.x / 100) * containerW,
        top: layout.height === 'auto' ? (layout.y / 100) * containerH : layout.y,
        right: (layout.x / 100) * containerW + wPx,
        bottom: layout.height === 'auto'
          ? (layout.y / 100) * containerH + 300
          : layout.y + hPx,
        width: wPx,
        height: hPx,
      }
    },
    []
  )

  const rectsOverlap = (
    a: { left: number; right: number; top: number; bottom: number },
    b: { left: number; right: number; top: number; bottom: number }
  ) => {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  }

  /**
   * After moving/resizing a card, push overlapping cards down to resolve collisions.
   * Returns a new layouts map with all collisions resolved.
   */
  const resolveCollisions = useCallback(
    (
      currentLayouts: CardLayoutMap,
      movedCardId: string,
      containerW: number,
      containerH: number
    ): CardLayoutMap => {
      const result: CardLayoutMap = JSON.parse(JSON.stringify(currentLayouts))
      const ids = cardIds.filter((id) => id !== movedCardId && result[id])

      // Get bounding box of the moved card
      const movedLayout = result[movedCardId]
      if (!movedLayout) return result

      // Keep pushing until no overlaps
      let hasOverlap = true
      const maxIterations = 50
      let iteration = 0

      while (hasOverlap && iteration < maxIterations) {
        hasOverlap = false
        iteration++

        const movedBox = getBoundingBox(movedLayout, containerW, containerH)

        for (const id of ids) {
          const otherLayout = result[id]
          if (!otherLayout) continue

          const otherBox = getBoundingBox(otherLayout, containerW, containerH)

          if (rectsOverlap(movedBox, otherBox)) {
            // Push the other card down below the moved card
            const pushAmount = movedBox.bottom - otherBox.top + GAP_PX

            if (otherLayout.height === 'auto') {
              // y is stored as percentage
              const pushPct = (pushAmount / containerH) * 100
              otherLayout.y = Math.max(0, otherLayout.y + pushPct)
            } else {
              otherLayout.y = otherLayout.y + pushAmount
            }

            hasOverlap = true

            // Recalculate the other card's box for subsequent overlap checks
            const newOtherBox = getBoundingBox(otherLayout, containerW, containerH)
            // Check if the pushed card now overlaps with any others (including the moved one again)
            for (const otherId of ids) {
              if (otherId === id) continue
              const thirdLayout = result[otherId]
              if (!thirdLayout) continue
              const thirdBox = getBoundingBox(thirdLayout, containerW, containerH)
              if (rectsOverlap(newOtherBox, thirdBox)) {
                const push2 = newOtherBox.bottom - thirdBox.top + GAP_PX
                if (thirdLayout.height === 'auto') {
                  thirdLayout.y = Math.max(0, thirdLayout.y + (push2 / containerH) * 100)
                } else {
                  thirdLayout.y = thirdLayout.y + push2
                }
                hasOverlap = true
              }
            }

            // Also check the moved card against the new position
            const updatedMovedBox = getBoundingBox(movedLayout, containerW, containerH)
            const pushedBox = getBoundingBox(otherLayout, containerW, containerH)
            if (rectsOverlap(updatedMovedBox, pushedBox)) {
              const pushAgain = updatedMovedBox.bottom - pushedBox.top + GAP_PX
              if (otherLayout.height === 'auto') {
                otherLayout.y = Math.max(0, otherLayout.y + (pushAgain / containerH) * 100)
              } else {
                otherLayout.y = otherLayout.y + pushAgain
              }
            }
          }
        }

        // Recalculate moved box after pushes
        const updatedMoved = getBoundingBox(movedLayout, containerW, containerH)
        // Check if any cards still overlap with the moved one
        for (const id of ids) {
          const otherLayout = result[id]
          if (!otherLayout) continue
          const otherBox = getBoundingBox(otherLayout, containerW, containerH)
          if (rectsOverlap(updatedMoved, otherBox)) {
            hasOverlap = true
          }
        }
      }

      return result
    },
    [cardIds, getBoundingBox]
  )

  // ─── Drag to Move ────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (cardId: string, e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return

      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const layout = layouts[cardId]
      if (!layout) return

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      draggingRef.current = {
        cardId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLayout: { ...layout },
        containerWidth: rect.width,
        containerHeight: rect.height,
      }
      setIsDragging(true)
      setDragCardId(cardId)
    },
    [layouts]
  )

  // Window-level pointermove/pointerup for drag
  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      const drag = draggingRef.current
      if (!drag) return

      const deltaX = e.clientX - drag.startMouseX
      const deltaY = e.clientY - drag.startMouseY

      // Convert pixels to percentages
      const deltaPctX = (deltaX / drag.containerWidth) * 100
      const deltaPctY = deltaY // For auto-height, y is still a pixel offset but stored as pct

      let newX = drag.startLayout.x + deltaPctX
      let newY: number

      if (drag.startLayout.height === 'auto') {
        newY = drag.startLayout.y + (deltaY / drag.containerHeight) * 100
      } else {
        newY = drag.startLayout.y + deltaY
      }

      // Clamp to container bounds
      newX = Math.max(0, Math.min(100 - MIN_WIDTH_PCT, newX))
      newY = Math.max(0, newY)

      setLayouts((prev) => {
        const updated: CardLayoutMap = {
          ...prev,
          [drag.cardId]: {
            ...prev[drag.cardId],
            x: newX,
            y: newY,
          },
        }
        // Resolve collisions
        return resolveCollisions(updated, drag.cardId, drag.containerWidth, drag.containerHeight)
      })
    }

    const onUp = () => {
      draggingRef.current = null
      setIsDragging(false)
      setDragCardId(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDragging, resolveCollisions])

  // ─── Drag to Resize ──────────────────────────────────────────────────

  const handleResizeStart = useCallback(
    (cardId: string, edge: ResizeState['edge'], e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return

      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const layout = layouts[cardId]
      if (!layout) return

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      resizingRef.current = {
        cardId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLayout: { ...layout },
        containerWidth: rect.width,
        containerHeight: rect.height,
        edge,
      }
      setIsResizing(true)
      setResizeCardId(cardId)
    },
    [layouts]
  )

  // Window-level pointermove/pointerup for resize
  useEffect(() => {
    if (!isResizing) return

    const onMove = (e: PointerEvent) => {
      const resize = resizingRef.current
      if (!resize) return

      const deltaX = e.clientX - resize.startMouseX
      const deltaY = e.clientY - resize.startMouseY
      const deltaPctX = (deltaX / resize.containerWidth) * 100
      const deltaPctY = deltaY // height stored as pixels when not 'auto'

      let newWidth = resize.startLayout.width
      let newHeight = resize.startLayout.height
      let newX = resize.startLayout.x
      let newY = resize.startLayout.y

      const edge = resize.edge

      // Width changes
      if (edge.includes('e')) {
        newWidth = Math.max(MIN_WIDTH_PCT, Math.min(100, resize.startLayout.width + deltaPctX))
        // If resize would go past right edge, clamp
        if (newX + newWidth > 100) {
          newWidth = 100 - newX
        }
      }
      if (edge.includes('w')) {
        const maxShrink = resize.startLayout.x // can't go past left edge
        const shrinkBy = Math.min(deltaPctX, maxShrink)
        newX = resize.startLayout.x - shrinkBy
        newWidth = resize.startLayout.width + shrinkBy
        newWidth = Math.max(MIN_WIDTH_PCT, Math.min(100, newWidth))
        if (newX + newWidth > 100) {
          newWidth = 100 - newX
        }
      }

      // Height changes
      if (edge.includes('s') && resize.startLayout.height !== 'auto') {
        const startH = resize.startLayout.height as number
        const minH = MIN_HEIGHT_PX
        newHeight = Math.max(minH, startH + deltaY)
      }
      if (edge.includes('n') && resize.startLayout.height !== 'auto') {
        const startH = resize.startLayout.height as number
        const startY = resize.startLayout.y
        const deltaUp = Math.min(deltaY, startY) // can't go above top
        newY = startY - deltaUp
        newHeight = Math.max(MIN_HEIGHT_PX, startH + deltaUp)
      }

      setLayouts((prev) => {
        const updated: CardLayoutMap = {
          ...prev,
          [resize.cardId]: {
            x: Math.max(0, Math.min(100 - MIN_WIDTH_PCT, newX)),
            y: newHeight === 'auto' ? Math.max(0, newY) : Math.max(0, newY),
            width: Math.max(MIN_WIDTH_PCT, Math.min(100, newWidth)),
            height: newHeight,
          },
        }
        return resolveCollisions(updated, resize.cardId, resize.containerWidth, resize.containerHeight)
      })
    }

    const onUp = () => {
      resizingRef.current = null
      setIsResizing(false)
      setResizeCardId(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isResizing, resolveCollisions])

  // ─── Toggle Full/Half Width ─────────────────────────────────────────

  const toggleWidth = useCallback(
    (cardId: string) => {
      setLayouts((prev) => {
        const layout = prev[cardId]
        if (!layout) return prev

        const isFull = layout.width >= 95
        const newLayout: DashboardCardLayout = {
          ...layout,
          width: isFull ? 48 : 100,
          x: isFull ? 0 : 0,
        }

        const container = containerRef.current
        const cw = container?.getBoundingClientRect().width ?? 800
        const ch = container?.getBoundingClientRect().height ?? 600

        const updated: CardLayoutMap = {
          ...prev,
          [cardId]: newLayout,
        }
        return resolveCollisions(updated, cardId, cw, ch)
      })
    },
    [resolveCollisions]
  )

  return {
    layouts,
    setLayouts,
    containerRef,
    isDragging,
    dragCardId,
    isResizing,
    resizeCardId,
    handleDragStart,
    handleResizeStart,
    toggleWidth,
  }
}
