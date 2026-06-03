import { useCallback, useMemo, useRef } from 'react'

/**
 * Guards optimistic local state against stale background reads.
 *
 * A background fetch (30s poll, app-event refetch, reconnect/offline-queue flush)
 * can return data that predates a local mutation. Applying it with a full
 * `setItems(serverData)` replacement clobbers the correct local state — items the
 * user just added/deleted/checked flicker back in or out. See QA.md §12.27.
 *
 * Two failure modes are covered:
 *  1. Read issued *before* a mutation, lands *after* it — caught by the generation
 *     snapshot (`version` changed between `snapshot()` and `canApply()`).
 *  2. A slow await-then-set mutation is still in flight when the read lands —
 *     caught by the in-flight counter (`runMutation`).
 * A short settle window also covers the gap between an optimistic local update and
 * the server commit, where a freshly-issued read can still see pre-mutation data.
 *
 * Mutations call `bump()` (synchronous/optimistic state change) or wrap awaited
 * work in `runMutation()` (state set only after the server responds). Background
 * reads `snapshot()` the generation when issued and apply the result only if
 * `canApply(snapshot)` is still true on arrival.
 *
 * This supersedes the ad-hoc `lastMutAt` + `pendingMutations` refs that previously
 * lived inline in `useShoppingList` / `useTodoList` (QA.md §12.21, §12.25).
 */

const SETTLE_MS = 3000

export interface MutationGuard {
  /** Stamp a synchronous/optimistic local mutation (bumps generation + settle window). */
  bump: () => void
  /** Wrap an awaited mutation so background reads skip for its whole duration. */
  runMutation: <T>(fn: () => Promise<T>) => Promise<T>
  /** Capture the current generation at the moment a background read is issued. */
  snapshot: () => number
  /** True when a background read captured at `atVersion` is safe to apply. */
  canApply: (atVersion: number) => boolean
}

export function useMutationGuard(): MutationGuard {
  const version = useRef(0)
  const inflight = useRef(0)
  const lastEndedAt = useRef(0)

  const bump = useCallback(() => {
    version.current++
    lastEndedAt.current = Date.now()
  }, [])

  const runMutation = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    version.current++
    inflight.current++
    try {
      return await fn()
    } finally {
      inflight.current--
      lastEndedAt.current = Date.now()
    }
  }, [])

  const snapshot = useCallback(() => version.current, [])

  const canApply = useCallback((atVersion: number) => (
    inflight.current === 0
    && version.current === atVersion
    && Date.now() - lastEndedAt.current >= SETTLE_MS
  ), [])

  return useMemo(
    () => ({ bump, runMutation, snapshot, canApply }),
    [bump, runMutation, snapshot, canApply],
  )
}
