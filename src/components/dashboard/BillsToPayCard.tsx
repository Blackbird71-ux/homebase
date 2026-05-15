'use client'

import { useRef, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Receipt } from 'lucide-react'
import type { BillSummaryItem } from '@/types'
import Link from 'next/link'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function dueDateLabel(bill: BillSummaryItem) {
  if (bill.isOverdue) return 'Overdue'
  if (bill.daysUntilDue === 0) return 'Due today'
  if (bill.daysUntilDue === 1) return 'Due tomorrow'
  return `Due in ${bill.daysUntilDue}d`
}

// Each bill row is approximately this many pixels tall (name line + subtitle line + padding)
const ROW_HEIGHT_PX = 44

export function BillsToPayCard({ bills }: { bills: BillSummaryItem[] }) {
  const nonAutoPay = bills.filter((b) => !b.autoPay)
  const displayBills = nonAutoPay.length > 0 ? nonAutoPay : bills

  const contentRef = useRef<HTMLDivElement>(null)
  const [maxVisible, setMaxVisible] = useState(5)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height
        // Reserve ~8px for the "X more" overflow label when needed
        const available = height - 8
        const count = Math.max(1, Math.floor(available / ROW_HEIGHT_PX))
        setMaxVisible(count)
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visible = displayBills.slice(0, maxVisible)
  const overflow = displayBills.length - visible.length

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Receipt className="h-4 w-4" /> Bills to Pay
        </CardTitle>
      </CardHeader>
      <CardContent ref={contentRef} className="flex-1 min-h-0 overflow-hidden">
        {displayBills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills due in the next 30 days</p>
        ) : (
          <Link href="/finance/bills" className="block space-y-2">
            {visible.map((bill) => {
              const isPartial = bill.remainingBalance != null && bill.remainingBalance > 0 && bill.remainingBalance < bill.amount
              return (
                <div key={bill.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{bill.name}</p>
                    <p className={`text-xs ${bill.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {dueDateLabel(bill)}
                      {bill.autoPay && <span className="ml-1 text-muted-foreground">(auto)</span>}
                      {isPartial && <span className="ml-1 text-amber-600 font-medium">· Partial</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(bill.amount)}</span>
                    {isPartial && (
                      <p className="text-xs text-amber-600 font-medium leading-tight">{formatCurrency(bill.remainingBalance!)} due</p>
                    )}
                  </div>
                </div>
              )
            })}
            {overflow > 0 && (
              <p className="text-xs text-muted-foreground">+{overflow} more</p>
            )}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
