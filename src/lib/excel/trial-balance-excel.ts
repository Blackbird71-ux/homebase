import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle, subSectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle, setCols, freeze, styleRow, FMT, sc,
} from '@/lib/excelStyles'

interface TBAccount {
  id: string; name: string; type: string; glCode: string | null
  parentId: string | null; parentName: string | null
  totalDebit: number; totalCredit: number; netBalance: number
}

interface TrialBalanceData {
  mode: 'trial-balance'
  accounts: TBAccount[]
  grandTotalDebit: number; grandTotalCredit: number
  isBalanced: boolean; difference: number
  from: string | null; to: string | null
}

interface GLLine {
  id: string; date: string; reference: string; description: string
  type: 'journal' | 'transaction'; entryType: string
  debit: number; credit: number; movement: number; balance: number
  lineDescription: string | null
}

interface GLAccount {
  id: string; name: string; type: string; glCode: string | null
  parentName: string | null; openingBalance: number
}

interface GeneralLedgerData {
  mode: 'general-ledger'
  glAccount: GLAccount
  openingBalance: number; closingBalance: number
  totalDebit: number; totalCredit: number
  lines: GLLine[]
  from: string | null; to: string | null
}

export interface TrialBalanceExcelParams {
  data: TrialBalanceData | GeneralLedgerData
  printTitle: string
  printDateRange: string
}

export function buildTrialBalanceWorkbook({
  data, printTitle, printDateRange,
}: TrialBalanceExcelParams): XLSX.WorkBook {
  const wb  = XLSX.utils.book_new()
  const now = format(new Date(), 'd MMM yyyy h:mm a')

  const TYPE_LABELS: Record<string, string> = {
    asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
    income: 'Income', expense: 'Expenses', transfer: 'Transfers',
  }
  const TYPE_KEYS = ['asset', 'liability', 'equity', 'income', 'expense', 'transfer']

  XLSX.utils.book_append_sheet(wb, buildCoverSheet({
    reportTitle: printTitle,
    dateRange:   printDateRange,
    generatedAt: now,
  }), 'Info')

  // ── Trial Balance sheet ─────────────────────────────────────────
  if (data.mode === 'trial-balance') {
    const tb  = data as TrialBalanceData
    const aoa: any[][] = []
    aoa.push(['GL Code', 'Account Name', 'Account Type', 'Parent Group', 'Total Debits ($)', 'Total Credits ($)', 'Net Balance ($)'])

    for (const typeKey of TYPE_KEYS) {
      const rows = tb.accounts.filter(a =>
        typeKey === 'transfer'
          ? !TYPE_KEYS.slice(0, 5).includes(a.type)
          : a.type === typeKey
      )
      if (rows.length === 0) continue
      aoa.push([TYPE_LABELS[typeKey] ?? typeKey, '', '', '', '', '', ''])
      for (const a of rows) {
        aoa.push([
          a.glCode ?? '',
          a.parentName ? `${a.parentName} — ${a.name}` : a.name,
          a.type, a.parentName ?? '',
          a.totalDebit  || null,
          a.totalCredit || null,
          a.netBalance  || null,
        ])
      }
      const dr = rows.reduce((s, a) => s + a.totalDebit, 0)
      const cr = rows.reduce((s, a) => s + a.totalCredit, 0)
      aoa.push([`${TYPE_LABELS[typeKey]} Total`, '', '', '', dr || null, cr || null, (dr - cr) || null])
    }
    aoa.push([])
    aoa.push(['GRAND TOTAL', '', '', '', tb.grandTotalDebit, tb.grandTotalCredit, tb.grandTotalDebit - tb.grandTotalCredit])
    aoa.push([tb.isBalanced ? '✓ Ledger is balanced' : `⚠ Out of balance by ${Math.abs(tb.difference).toFixed(2)}`, '', '', '', '', '', ''])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    setCols(ws, [10, 38, 14, 22, 18, 18, 18])
    freeze(ws, 1, 2)
    styleRow(ws, 0, 0, 6, headerStyle())
    sc(ws, 0, 0, headerLeftStyle())
    sc(ws, 0, 1, headerLeftStyle())

    let dataIdx = 0
    for (let r = 1; r < aoa.length; r++) {
      const row   = aoa[r]
      const label = String(row?.[0] ?? '')
      if (!row?.length) continue
      const isSect  = Object.values(TYPE_LABELS).includes(label)
      const isSub   = label.endsWith(' Total') && !label.startsWith('GRAND')
      const isGrand = label === 'GRAND TOTAL'
      const isNote  = label.startsWith('✓') || label.startsWith('⚠')
      if (isSect) {
        styleRow(ws, r, 0, 6, sectionStyle())
      } else if (isSub) {
        sc(ws, r, 0, totalLabelStyle()); for (let c = 1; c <= 6; c++) sc(ws, r, c, totalStyle())
      } else if (isGrand) {
        sc(ws, r, 0, grandTotalLabelStyle()); for (let c = 1; c <= 6; c++) sc(ws, r, c, grandTotalStyle())
      } else if (isNote) {
        sc(ws, r, 0, { font: { italic: true, name: 'Arial', sz: 9,
          color: { rgb: tb.isBalanced ? '375623' : 'C00000' } } })
      } else {
        const alt = dataIdx % 2 === 1
        sc(ws, r, 0, dataLabelStyle(alt))
        sc(ws, r, 1, dataLabelStyle(alt))
        sc(ws, r, 2, dataLabelStyle(alt))
        sc(ws, r, 3, dataLabelStyle(alt))
        for (let c = 4; c <= 6; c++) sc(ws, r, c, dataStyle(alt))
        dataIdx++
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance')
  }

  // ── General Ledger sheet ────────────────────────────────────────
  if (data.mode === 'general-ledger') {
    const gl  = data as GeneralLedgerData
    const aoa: any[][] = []
    const acctTitle = gl.glAccount.glCode
      ? `${gl.glAccount.glCode} — ${gl.glAccount.name}`
      : gl.glAccount.name
    aoa.push([acctTitle, '', '', '', '', '', ''])
    aoa.push(['Date', 'Reference', 'Description', 'Entry Type', 'Debit ($)', 'Credit ($)', 'Balance ($)'])
    aoa.push([gl.from ? new Date(gl.from) : 'All time', '', 'Opening balance', '', null, null, gl.openingBalance])
    for (const l of gl.lines) {
      aoa.push([
        new Date(l.date),
        l.reference || '',
        l.description + (l.lineDescription ? ` — ${l.lineDescription}` : ''),
        l.type === 'journal' ? l.entryType : 'transaction',
        l.debit  || null,
        l.credit || null,
        l.balance,
      ])
    }
    aoa.push([])
    aoa.push(['Closing Balance', '', `${gl.lines.length} lines`, '', gl.totalDebit, gl.totalCredit, gl.closingBalance])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    setCols(ws, [14, 10, 42, 16, 16, 16, 16])
    freeze(ws, 2, 1)
    styleRow(ws, 0, 0, 6, headerLeftStyle())
    styleRow(ws, 1, 0, 6, headerStyle())
    sc(ws, 1, 0, headerLeftStyle())
    sc(ws, 1, 2, headerLeftStyle())
    sc(ws, 1, 3, headerLeftStyle())
    styleRow(ws, 2, 0, 6, subSectionStyle())
    for (let r = 3; r < aoa.length - 2; r++) {
      const alt = (r - 3) % 2 === 1
      sc(ws, r, 0, { ...dataLabelStyle(alt), numFmt: FMT.DATE })
      sc(ws, r, 1, dataLabelStyle(alt))
      sc(ws, r, 2, dataLabelStyle(alt))
      sc(ws, r, 3, dataLabelStyle(alt))
      for (let c = 4; c <= 6; c++) sc(ws, r, c, dataStyle(alt))
    }
    const closeR = aoa.length - 1
    sc(ws, closeR, 0, grandTotalLabelStyle())
    sc(ws, closeR, 2, grandTotalLabelStyle())
    for (let c = 3; c <= 6; c++) sc(ws, closeR, c, grandTotalStyle())
    XLSX.utils.book_append_sheet(wb, ws, 'General Ledger')
  }

  return wb
}
