import { format } from 'date-fns'

export interface DatePreset { label: string; from: string; to: string }

export interface LedgerData {
  category: {
    id: string
    name: string
    glCode: string | null
    type: string
    normalBalance: 'debit' | 'credit'
  }
  dateFrom: string
  dateTo: string
  openingBalance: number
  rows: LedgerRow[]
  totals: {
    totalDebits: number
    totalCredits: number
    closingBalance: number
  }
}

export interface LedgerRow {
  id: string
  date: string
  description: string
  reference: string | null
  source: 'transaction' | 'journal'
  sourceId: string
  debit: number
  credit: number
  balance: number
  vendor: string | null
  isCleared: boolean
}

/** Format an ISO date string (with or without time component) as "d MMM yyyy". */
export function fmtDate(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM yyyy')
  } catch {
    return iso
  }
}

/** Build the standard set of date range presets for the account ledger date picker. */
export function buildPresets(fyStartMonth: number): DatePreset[] {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const pad   = (n: number) => String(n).padStart(2, '0')

  function fyDates(fyYear: number): { from: string; to: string; label: string } {
    const endYear   = fyStartMonth === 1 ? fyYear : fyYear + 1
    const lastMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1
    const lastDay   = new Date(endYear, lastMonth, 0).getDate()
    return {
      from:  `${fyYear}-${pad(fyStartMonth)}-01`,
      to:    `${endYear}-${pad(lastMonth)}-${pad(lastDay)}`,
      label: fyStartMonth === 1 ? `${fyYear}` : `${fyYear}–${String(endYear).slice(-2)}`,
    }
  }

  const currFyYear = month >= fyStartMonth ? year : year - 1
  const curr = fyDates(currFyYear)
  const prev = fyDates(currFyYear - 1)

  return [
    { label: `FY ${curr.label} (current)`, from: curr.from, to: curr.to },
    { label: `FY ${prev.label} (previous)`, from: prev.from, to: prev.to },
    { label: `CY ${year}`,     from: `${year}-01-01`,     to: `${year}-12-31` },
    { label: `CY ${year - 1}`, from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    { label: 'All time', from: '2000-01-01', to: '2099-12-31' },
    { label: 'Custom…',  from: '',           to: '' },
  ]
}

/** Trigger a CSV download of the ledger data. Client-only (uses DOM Blob/anchor). */
export function exportCsv(data: LedgerData) {
  const lines = [
    ['Date', 'Description', 'Reference', 'Source', 'Vendor', 'Debit', 'Credit', 'Balance', 'Cleared'].join(','),
    `"${data.dateFrom}","Opening Balance","","","","","","${data.openingBalance.toFixed(2)}","✓"`,
    ...data.rows.map(r =>
      [
        `"${fmtDate(r.date)}"`,
        `"${r.description.replace(/"/g, '""')}"`,
        `"${r.reference ?? ''}"`,
        `"${r.source === 'journal' ? 'Journal Entry' : 'Transaction'}"`,
        `"${r.vendor ?? ''}"`,
        r.debit  > 0 ? r.debit.toFixed(2)  : '',
        r.credit > 0 ? r.credit.toFixed(2) : '',
        r.balance.toFixed(2),
        r.isCleared ? '✓' : '○',
      ].join(',')
    ),
    `"TOTALS","","","","","${data.totals.totalDebits.toFixed(2)}","${data.totals.totalCredits.toFixed(2)}","${data.totals.closingBalance.toFixed(2)}",""`,
  ].join('\n')

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ledger-${data.category.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${data.dateFrom}-to-${data.dateTo}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
