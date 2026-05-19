import { cn } from '@/lib/utils'

type Variant = 'ok' | 'soon' | 'late' | 'info' | 'neutral' | 'accent'

interface StatusChipProps {
  children: React.ReactNode
  variant?: Variant
  dot?: boolean
  className?: string
}

export function StatusChip({ children, variant = 'neutral', dot = false, className }: StatusChipProps) {
  return (
    <span className={cn('hb-chip', `hb-chip--${variant}`, className)}>
      {dot && <span className="hb-chip__dot" />}
      {children}
    </span>
  )
}
