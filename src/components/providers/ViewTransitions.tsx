'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Route morphs via the native View Transitions API. The App Router does
// client-side ("soft") navigation, so the CSS `@view-transition` MPA rule never
// fires — we wrap the navigation in document.startViewTransition ourselves.
// Mounts once (root layout) and intercepts same-origin internal link clicks so
// the old and new pages cross-fade (styled in premium.css) instead of cutting.
//
// Heavily guarded: only plain left-clicks on internal anchors are intercepted;
// new-tab / download / external / modified clicks fall through untouched. No-ops
// entirely when the API is missing or reduced-motion is on, so navigation is
// never blocked — worst case you get the old instant cut.

export function ViewTransitions() {
  const router = useRouter()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => unknown
    }).startViewTransition
    if (typeof startViewTransition !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as Element | null)?.closest?.('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download') || anchor.dataset.noVt !== undefined) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      e.preventDefault()
      const dest = url.pathname + url.search + url.hash
      startViewTransition!(() =>
        // Resolve after React has had a couple of frames to commit the new
        // route so the transition snapshots fresh content, not the old page.
        new Promise<void>(resolve => {
          router.push(dest)
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
      )
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router])

  return null
}
