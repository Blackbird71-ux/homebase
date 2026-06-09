'use client'

/**
 * EditorDisclosure
 *
 * A collapsible "Advanced" / "Optional details" section for the finance editors.
 * Models the existing "More options" collapse in TemplateFormDialog.tsx: collapsed
 * by default, and the label turns amber when it is closed but holds a non-default
 * value (so the user can see "there's something set in here").
 */

import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** Label next to the chevron, e.g. "Advanced" or "Optional details". */
  label: string
  /** Section contents, rendered only when expanded. */
  children: ReactNode
  /** When true and collapsed, the label turns amber to flag a non-default value inside. */
  hasData?: boolean
  /** Start expanded. Defaults to collapsed. */
  defaultOpen?: boolean
  className?: string
}

export function EditorDisclosure({ label, children, hasData = false, defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1 text-xs hover:text-foreground',
          hasData && !open ? 'text-amber-500 font-medium' : 'text-muted-foreground',
        )}
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-180')} />
        {label}
        {hasData && !open && <span className="ml-0.5">·</span>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}
