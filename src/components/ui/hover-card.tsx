'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

interface HoverCardProps {
  children: ReactNode
  /** The content shown inside the popover */
  content: ReactNode
  /** Side to anchor: 'top' | 'bottom' | 'left' | 'right' */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Additional classes on the wrapper */
  className?: string
  /** Additional classes on the floating popover */
  contentClassName?: string
}

export function HoverCard({
  children,
  content,
  side = 'bottom',
  className = '',
  contentClassName = '',
}: HoverCardProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setOpen(true), 200)
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }

  function handleTouch(e: React.TouchEvent) {
    e.preventDefault()
    setOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const trigger = triggerRef.current
    const rect = trigger.getBoundingClientRect()

    switch (side) {
      case 'top':
        setPosition({ top: rect.top - 4, left: rect.left + rect.width / 2 })
        break
      case 'bottom':
        setPosition({ top: rect.bottom + 4, left: rect.left + rect.width / 2 })
        break
      case 'left':
        setPosition({ top: rect.top + rect.height / 2, left: rect.left - 4 })
        break
      case 'right':
        setPosition({ top: rect.top + rect.height / 2, left: rect.right + 4 })
        break
    }
  }, [open, side])

  function handleContentEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  function handleContentLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouch}
      ref={triggerRef}
    >
      {children}

      {open && (
        <div
          className={`fixed z-[999] animate-in fade-in zoom-in-95 duration-150 ${contentClassName}`}
          style={{
            top: position.top,
            left: position.left,
            transform:
              side === 'top' || side === 'bottom'
                ? 'translateX(-50%)'
                : 'translateY(-50%)',
          }}
          onMouseEnter={handleContentEnter}
          onMouseLeave={handleContentLeave}
        >
          {content}
        </div>
      )}
    </div>
  )
}