'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { withViewTransition } from '@/lib/view-transition'

// Tappable half-bubbles flush to each screen edge (back left, forward right),
// one-fifth up from the bottom. Touch-only — hidden on pointer:fine devices via
// CSS — so they don't clutter the desktop layout where the browser chrome
// already has back/forward. Each wraps the navigation in withViewTransition so
// it cross-fades just like a link click.
//
// Note: browsers don't expose whether a forward history entry exists, so the
// forward bubble can't be disabled when there's nothing ahead — tapping it then
// is simply a no-op.

export function NavBubbles() {
  const router = useRouter()

  return (
    <div className="hb-nav-bubbles">
      <button
        type="button"
        aria-label="Go back"
        className="hb-nav-bubble hb-nav-bubble--back"
        onClick={() => withViewTransition(() => router.back())}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Go forward"
        className="hb-nav-bubble hb-nav-bubble--fwd"
        onClick={() => withViewTransition(() => router.forward())}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
