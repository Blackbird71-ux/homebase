'use client'

import { Bot, HelpCircle } from 'lucide-react'

interface TopBarActionsProps {
  onOpenAI: () => void
  onOpenHelp: () => void
}

/**
 * Renders AI Assistant and Help icon buttons in the top-right
 * of the main content area. Placed via absolute positioning
 * in the parent container.
 */
export function TopBarActions({ onOpenAI, onOpenHelp }: TopBarActionsProps) {
  return (
    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
      {/* AI Assistant */}
      <button
        type="button"
        onClick={onOpenAI}
        className="flex items-center justify-center h-8 w-8 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
        title="AI Assistant"
        aria-label="Open AI Assistant"
      >
        <Bot className="h-4 w-4" />
      </button>

      {/* Help */}
      <button
        type="button"
        onClick={onOpenHelp}
        className="flex items-center justify-center h-8 w-8 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
        title="Help"
        aria-label="Open Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  )
}
