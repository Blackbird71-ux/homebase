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

export function HelpButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState<HelpPage | null>(null)

  useEffect(() => {
    setHelp(getHelpForPath(pathname))
  }, [pathname])

  // Don't render on login/register pages or if no help content exists
  if (!help) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-110 active:scale-95"
        title="Help"
        aria-label="Help"
      >
        <HelpCircleIcon className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              <XIcon className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
