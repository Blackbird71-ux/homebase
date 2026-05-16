'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'meal-plan-panel-width'
const DEFAULT_WIDTH = 288  // w-72 = 18rem = 288px
const MIN_WIDTH = 220
const MAX_WIDTH = 480

export function usePanelResize() {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_WIDTH)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const w = parseInt(stored, 10)
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) setPanelWidth(w)
      }
    } catch { /* ignore */ }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = panelWidth
  }, [panelWidth])

  useEffect(() => {
    if (!isResizing) return

    function onMouseMove(e: MouseEvent) {
      // Drag leftward increases panel width (panel is on the right)
      const delta = startXRef.current - e.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
      setPanelWidth(next)
    }

    function onMouseUp() {
      setIsResizing(false)
      try {
        localStorage.setItem(STORAGE_KEY, String(panelWidth))
      } catch { /* ignore */ }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing, panelWidth])

  // Persist when panelWidth settles (mouseup fires before this effect in some browsers)
  const persistWidth = useCallback((w: number) => {
    try { localStorage.setItem(STORAGE_KEY, String(w)) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!isResizing) persistWidth(panelWidth)
  }, [isResizing, panelWidth, persistWidth])

  return { panelWidth, isResizing, onMouseDown }
}
