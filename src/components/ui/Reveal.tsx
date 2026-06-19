'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useReveal } from '@/hooks/useReveal'

interface RevealProps {
  children: ReactNode
  /** Position in a list — staggers the reveal so a batch cascades in. */
  index?: number
  className?: string
}

/**
 * Wraps content so it fades + rises into view on scroll (premium.css `.reveal`).
 * Drop it around list items / cards:
 *   {items.map((it, i) => <Reveal key={it.id} index={i}><Card …/></Reveal>)}
 * The wrapper is a plain block div, so it inherits its parent's grid/flex slot.
 */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : 'reveal'}
      style={{ '--reveal-delay': `${Math.min(index, 6) * 55}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
