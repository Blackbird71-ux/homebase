'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  colorDot?: string
  defaultOpen?: boolean
  forceOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  subtitle,
  colorDot,
  defaultOpen = true,
  forceOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    if (forceOpen) setIsOpen(true)
  }, [forceOpen])

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium bg-muted/30 hover:bg-muted/60 transition-colors"
      >
        {colorDot && (
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: colorDot }}
          />
        )}
        <span className="flex-1 text-left">{title}</span>
        {subtitle && (
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {subtitle}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="divide-y divide-border">{children}</div>
        </div>
      </div>
    </div>
  )
}
