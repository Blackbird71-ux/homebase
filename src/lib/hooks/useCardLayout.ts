'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardCardLayout } from '@/lib/dashboard-cards'

export const MIN_WIDTH_PCT = 25
const MIN_HEIGHT_PX = 150
const GAP_PX = 16
// Estimated height used for collision detection when height is 'auto'
const AUTO_HEIGHT_EST_PX = 400

export interface CardLayoutMap {
  [cardId: string]: DashboardCardLayout
}

interface DragState {
  cardId: string
  startMouseX: number
  startMouseY: number
  startLayout: DashboardCardLayout
  containerWidth: number
}

interface ResizeState {
  cardId: string
  startMouseX: number
  startMouseY: number
  startLayout: DashboardCardLayout
  containerWidth: number
  edge: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'
}

/**
 * Returns true if a saved auto-height card's y value looks like it was stored
 * as a percentage (old format) rather than pixels. Percentage values were
 * small numbers (0–200) while pixel values for non-first cards start at 420+.
 * We use a threshold of 150px: any auto-height card with 0 < y < 150 is
 * assumed to be a stale percentage value and will be regenerated.
 */
export function isStalePercentageY(layout: DashboardCardLayout): boolean {
  return layout.height === 'auto' && layout.y > 0 && layout.y < 150
}

function buildDefaultLayouts(cardIds: string[], base: CardLayoutMap = {}): CardLayoutMap {
  const result: CardLayoutMap = {}
  // Copy over saved layouts, but discard auto-height cards whose y looks like
  // an old percentage value — they would overlap badly after the pixel migration.
  for (const id of cardIds) {
    const saved = base[id]
    if (saved && !isStalePercentageY(saved)) {
      result[id] = { ...saved }
    }
  }
  // Auto-position any cards that still lack a layout
  let autoIndex = 0
  for (const id of cardIds) {
    if (!result[id]) {
      result[id] = {
        x: 0,
        y: autoIndex * (AUTO_HEIGHT_EST_PX + GAP_PX),
        width: 100,
        height: 'auto',
      }
    }
    autoIndex++
  }
  return result
}

export function useCardLayout(
  initialLayouts: CardLayoutMap,
  cardIds: string[],
  onSave?: (layouts: CardLayoutMap) => void
) {
  const [layouts, setLayouts] = useState<CardLayoutMap>(() =>
    buildDefaultLayouts(cardIds, initialLayouts)
  )

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts])

  // ─── Collision / Push Logic ──────────────────────────────────────────

  // y is always in pixels. x and width are percentages of container width.
  const getBoundingBox = useCallback(
    (layout: DashboardCardLayout, containerW: number) => {
      const wPx = (layout.width / 100) * containerW
      const hPx = layout.height === 'auto' ? AUTO_HEIGHT_EST_PX : layout.height
      return {
        left: (layout.x / 100) * containerW,
        top: layout.y,
        right: (layout.x / 100) * containerW + wPx,
        bottom: layout.y + hPx,
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

  const resolveCollisions = useCallback(
    (
      currentLayouts: CardLayoutMap,
      movedCardId: string,
      containerW: number
    ): CardLayoutMap => {
      const result: CardLayoutMap = JSON.parse(JSON.stringify(currentLayouts))
      const ids = cardIds.filter((id) => id !== movedCardId && result[id])

      const movedLayout = result[movedCardId]
      if (!movedLayout) return result

      let hasOverlap = true
      const maxIterations = 50
      let iteration = 0

      while (hasOverlap && iteration < maxIterations) {
        hasOverlap = false
        iteration++

        const movedBox = getBoundingBox(movedLayout, containerW)

        for (const id of ids) {
          const otherLayout = result[id]
          if (!otherLayout) continue

          const otherBox = getBoundingBox(otherLayout, containerW)

          if (rectsOverlap(movedBox, otherBox)) {
            // Push the other card down below the moved card (y is always pixels)
            const pushAmount = movedBox.bottom - otherBox.top + GAP_PX
            otherLayout.y = Math.max(0, otherLayout.y + pushAmount)
            hasOverlap = true

            const newOtherBox = getBoundingBox(otherLayout, containerW)
            for (const otherId of ids) {
              if (otherId === id) continue
              const thirdLayout = result[otherId]
              if (!thirdLayout) continue
              const thirdBox = getBoundingBox(thirdLayout, containerW)
              if (rectsOverlap(newOtherBox, thirdBox)) {
                const push2 = newOtherBox.bottom - thirdBox.top + GAP_PX
                thirdLayout.y = Math.max(0, thirdLayout.y + push2)
                hasOverlap = true
              }
            }

            const updatedMovedBox = getBoundingBox(movedLayout, containerW)
            const pushedBox = getBoundingBox(otherLayout, containerW)
            if (rectsOverlap(updatedMovedBox, pushedBox)) {
              const pushAgain = updatedMovedBox.bottom - pushedBox.top + GAP_PX
              otherLayout.y = Math.max(0, otherLayout.y + pushAgain)
            }
          }
        }

        const updatedMoved = getBoundingBox(movedLayout, containerW)
        for (const id of ids) {
          const otherLayout = result[id]
          if (!otherLayout) continue
          const otherBox = getBoundingBox(otherLayout, containerW)
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
      }
      setIsDragging(true)
      setDragCardId(cardId)
    },
    [layouts]
  )

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      const drag = draggingRef.current
      if (!drag) return

      const deltaX = e.clientX - drag.startMouseX
      const deltaY = e.clientY - drag.startMouseY

      const deltaPctX = (deltaX / drag.containerWidth) * 100
      // y is always pixels
      let newX = drag.startLayout.x + deltaPctX
      let newY = drag.startLayout.y + deltaY

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
        return resolveCollisions(updated, drag.cardId, drag.containerWidth)
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
        edge,
      }
      setIsResizing(true)
      setResizeCardId(cardId)
    },
    [layouts]
  )

  useEffect(() => {
    if (!isResizing) return

    const onMove = (e: PointerEvent) => {
      const resize = resizingRef.current
      if (!resize) return

      const deltaX = e.clientX - resize.startMouseX
      const deltaY = e.clientY - resize.startMouseY
      const deltaPctX = (deltaX / resize.containerWidth) * 100

      let newWidth = resize.startLayout.width
      let newHeight = resize.startLayout.height
      let newX = resize.startLayout.x
      let newY = resize.startLayout.y

      const edge = resize.edge

      if (edge.includes('e')) {
        newWidth = Math.max(MIN_WIDTH_PCT, Math.min(100, resize.startLayout.width + deltaPctX))
        if (newX + newWidth > 100) newWidth = 100 - newX
      }
      if (edge.includes('w')) {
        const maxShrink = resize.startLayout.x
        const shrinkBy = Math.min(deltaPctX, maxShrink)
        newX = resize.startLayout.x - shrinkBy
        newWidth = resize.startLayout.width + shrinkBy
        newWidth = Math.max(MIN_WIDTH_PCT, Math.min(100, newWidth))
        if (newX + newWidth > 100) newWidth = 100 - newX
      }

      // Height changes (y is always pixels)
      if (edge.includes('s') && resize.startLayout.height !== 'auto') {
        newHeight = Math.max(MIN_HEIGHT_PX, (resize.startLayout.height as number) + deltaY)
      }
      if (edge.includes('n') && resize.startLayout.height !== 'auto') {
        const startH = resize.startLayout.height as number
        const startY = resize.startLayout.y
        const deltaUp = Math.min(deltaY, startY)
        newY = startY - deltaUp
        newHeight = Math.max(MIN_HEIGHT_PX, startH + deltaUp)
      }

      setLayouts((prev) => {
        const updated: CardLayoutMap = {
          ...prev,
          [resize.cardId]: {
            x: Math.max(0, Math.min(100 - MIN_WIDTH_PCT, newX)),
            y: Math.max(0, newY),
            width: Math.max(MIN_WIDTH_PCT, Math.min(100, newWidth)),
            height: newHeight,
          },
        }
        return resolveCollisions(updated, resize.cardId, resize.containerWidth)
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

  const resetLayouts = useCallback(() => {
    const fresh = buildDefaultLayouts(cardIds)
    setLayouts(fresh)
  }, [cardIds])

  const toggleWidth = useCallback(
    (cardId: string) => {
      setLayouts((prev) => {
        const layout = prev[cardId]
        if (!layout) return prev

        const isFull = layout.width >= 95
        const newLayout: DashboardCardLayout = {
          ...layout,
          width: isFull ? 48 : 100,
          x: 0,
        }

        const container = containerRef.current
        const cw = container?.getBoundingClientRect().width ?? 800

        const updated: CardLayoutMap = {
          ...prev,
          [cardId]: newLayout,
        }
        return resolveCollisions(updated, cardId, cw)
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
    resetLayouts,
  }
}
