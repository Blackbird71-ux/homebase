import { useCallback, useRef } from 'react'

/**
 * Returns a stable debounced version of `fn` that fires after `delay` ms
 * of inactivity. Safe to use inside components — the timer ref is stable
 * across renders and the returned function identity never changes.
 */
export function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback(
    (...args: T) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  )
}
