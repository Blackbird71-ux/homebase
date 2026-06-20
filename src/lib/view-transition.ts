// Runs `navigate` inside a native View Transition so the old and new views
// cross-fade (styled in premium.css). Shared by the link-click interceptor
// (ViewTransitions) and the on-screen back/forward nav bubbles (NavBubbles) so
// the transition logic lives in one place, per the shared-helper rule.
//
// Falls back to calling `navigate` directly when the API is unavailable or
// reduced-motion is on, so navigation is never blocked — worst case is an
// instant cut.

export function withViewTransition(navigate: () => void): void {
  const startViewTransition =
    typeof document !== 'undefined'
      ? (document as Document & {
          startViewTransition?: (cb: () => void | Promise<void>) => unknown
        }).startViewTransition
      : undefined

  if (
    typeof startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    navigate()
    return
  }

  startViewTransition.call(document, () =>
    // Resolve after React has had a couple of frames to commit the new route so
    // the transition snapshots fresh content, not the old page.
    new Promise<void>(resolve => {
      navigate()
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  )
}
