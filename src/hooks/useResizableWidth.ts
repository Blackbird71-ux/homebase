'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Drag-to-resize width for a side panel, remembered in localStorage.
 * Spread `handleProps` onto a thin vertical handle on the panel's right edge.
 */
export function useResizableWidth(storageKey: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial)
  const widthRef = useRef(initial)
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max])

  // Browser-only read, so it runs in an effect (SSR safety)
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey))
      if (saved) {
        widthRef.current = clamp(saved)
        setWidth(widthRef.current)
      }
    } catch {}
  }, [storageKey, clamp])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    const onMove = (ev: PointerEvent) => {
      widthRef.current = clamp(startWidth + ev.clientX - startX)
      setWidth(widthRef.current)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try { localStorage.setItem(storageKey, String(widthRef.current)) } catch {}
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [clamp, storageKey])

  const onDoubleClick = useCallback(() => {
    widthRef.current = initial
    setWidth(initial)
    try { localStorage.removeItem(storageKey) } catch {}
  }, [initial, storageKey])

  return { width, handleProps: { onPointerDown, onDoubleClick } }
}
