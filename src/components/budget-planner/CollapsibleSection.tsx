'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium bg-muted/30 hover:bg-muted/60 transition-colors"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2 ml-auto">
          {subtitle && (
            <span className="text-xs font-normal text-muted-foreground">
              {subtitle}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0',
              isOpen && 'rotate-180'
            )}
          />
        </span>
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
