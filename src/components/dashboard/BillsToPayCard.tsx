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

export function BillsToPayCard({ bills }: { bills: BillSummaryItem[] }) {
  const nonAutoPay = bills.filter((b) => !b.autoPay)
  const displayBills = nonAutoPay.length > 0 ? nonAutoPay : bills

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Receipt className="h-4 w-4" /> Bills to Pay
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 min-h-0">
        {displayBills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills due in the next 30 days</p>
        ) : (
          <Link href="/finance" className="block space-y-2">
            {displayBills.slice(0, 5).map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{bill.name}</p>
                  <p className={`text-xs ${bill.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {dueDateLabel(bill)}
                    {bill.autoPay && <span className="ml-1 text-muted-foreground">(auto)</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(bill.amount)}</span>
              </div>
            ))}
            {displayBills.length > 5 && (
              <p className="text-xs text-muted-foreground">+{displayBills.length - 5} more</p>
            )}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
