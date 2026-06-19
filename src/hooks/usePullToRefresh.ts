'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

// Pull-to-refresh gesture. Attaches touch listeners to `containerRef` and, when
// the user drags DOWN while the scroller under their finger is already at the
// top, shows an elastic indicator and fires `onRefresh` past the threshold.
//
// Touch-only by nature (mouse/trackpad never emit these events). Guarded so it
// can't hijack other gestures:
//   • axis-locked — a mostly-horizontal swipe (e.g. the category pills) is
//     ignored, so horizontal scrollers keep working.
//   • only arms when the nearest scrollable ancestor is at scrollTop 0; if the
//     page is scrolled down, this is a no-op and native scroll runs untouched.
//   • preventDefault only while an armed downward pull is in progress, to stop
//     the browser's own rubber-band / native pull-to-refresh fighting ours.

const THRESHOLD = 70 // px of (resisted) pull needed to trigger a refresh
const MAX_PULL = 110 // clamp so the indicator never wanders too far down
const RESISTANCE = 0.5 // drag feels heavier than the raw finger travel
const AXIS_LOCK = 8 // px of travel before we commit to horizontal vs vertical

export type PullStatus = 'idle' | 'pulling' | 'ready' | 'refreshing'

// Nearest vertically-scrollable ancestor of `start`, bounded by `root`.
// Returns null when nothing in the chain scrolls (treat as "at top" = armable).
function scrollableAncestor(start: Element | null, root: Element): Element | null {
  let el: Element | null = start
  while (el && el !== root.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

export function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>
) {
  const [distance, setDistance] = useState(0)
  const [status, setStatus] = useState<PullStatus>('idle')

  // Per-gesture scratch state lives in a ref so the listeners stay stable.
  const g = useRef({ startX: 0, startY: 0, axis: '' as '' | 'h' | 'v', armed: false, active: false })
  // Keep the latest callback without re-binding listeners every render.
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function onStart(e: TouchEvent) {
      if (status === 'refreshing' || e.touches.length !== 1) return
      const t = e.touches[0]
      const scroller = scrollableAncestor(e.target as Element | null, el!)
      g.current = {
        startX: t.clientX,
        startY: t.clientY,
        axis: '',
        armed: !scroller || scroller.scrollTop <= 0,
        active: true,
      }
    }

    function onMove(e: TouchEvent) {
      const s = g.current
      if (!s.active || !s.armed) return
      const t = e.touches[0]
      const dx = t.clientX - s.startX
      const dy = t.clientY - s.startY

      if (s.axis === '') {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
        s.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        if (s.axis === 'h') { s.armed = false; return } // leave horizontal scroll alone
      }
      if (dy <= 0) { setDistance(0); setStatus('idle'); return }

      // Active downward pull at the top — take over from native scroll.
      e.preventDefault()
      const pulled = Math.min(dy * RESISTANCE, MAX_PULL)
      setDistance(pulled)
      setStatus(pulled >= THRESHOLD ? 'ready' : 'pulling')
    }

    function onEnd() {
      const s = g.current
      s.active = false
      if (status === 'ready' || distance >= THRESHOLD) {
        setStatus('refreshing')
        setDistance(THRESHOLD)
        Promise.resolve(onRefreshRef.current()).catch(() => {
          setStatus('idle')
          setDistance(0)
        })
      } else {
        setStatus('idle')
        setDistance(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [containerRef, status, distance])

  return { distance, status, threshold: THRESHOLD }
}
