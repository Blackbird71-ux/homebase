'use client'

import { useEffect, useRef } from 'react'

// Scroll-reveal: elements start hidden (.reveal in premium.css) and get
// `.is-visible` added once they scroll into view. One shared IntersectionObserver
// serves every revealable element on the page — cheaper than one observer each.
// Elements are unobserved after first reveal so they never re-hide on scroll-out.

let observer: IntersectionObserver | null = null

function getObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null
  if (!observer) {
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer!.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.04 }
    )
  }
  return observer
}

/**
 * Returns a ref to attach to a `.reveal` element. The element fades + rises in
 * when scrolled into view. SSR-safe (no window access during render) and
 * degrades to instant-visible when IntersectionObserver is unavailable.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = getObserver()
    if (!obs) {
      el.classList.add('is-visible')
      return
    }
    obs.observe(el)
    return () => obs.unobserve(el)
  }, [])
  return ref
}
