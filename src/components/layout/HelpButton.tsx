'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircleIcon, XIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getHelpForPath, type HelpPage } from './HelpContent'

interface HelpButtonProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpButton({ open, onOpenChange }: HelpButtonProps) {
  const pathname = usePathname()
  const [help, setHelp] = useState<HelpPage | null>(null)

  useEffect(() => {
    setHelp(getHelpForPath(pathname))
  }, [pathname])

  // Don't render if no help content exists
  if (!help) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <HelpCircleIcon className="h-5 w-5 text-primary" />
            How to use {help.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
          {help.sections.map((section, i) => (
            <section key={i}>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((item, j) => (
                  <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <XIcon className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
