import { useEffect, type RefObject } from 'react'

/**
 * Calls `callback` when a mousedown event occurs outside the element
 * referenced by `ref`. Attach the ref to the element you want to treat
 * as "inside" (e.g. a dropdown panel).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: () => void,
): void {
  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, callback])
}
