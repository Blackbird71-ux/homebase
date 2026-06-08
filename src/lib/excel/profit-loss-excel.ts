import * as XLSX from 'xlsx'
import { formatInTz } from '@/lib/timezone'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle, positiveStyle, negativeStyle,
  setCols, freeze, styleRow, sc,
} from '@/lib/excelStyles'

interface DrillItem {
  id: string; name: string; amount: number; periodAmount: number
  isOneOff: boolean; received?: boolean; paid?: boolean; date: string
}

interface GroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; count: number; items: DrillItem[]
}

export interface ProfitLossExcelParams {
  label: string
  incomeGroups: GroupRow[]
  expenseGroups: GroupRow[]
  totalIncome: number
  totalExpenses: number
  estimatedTax: number
  netProfit: number
  timezone: string
}

export function buildProfitLossWorkbook({
  label, incomeGroups, expenseGroups,
  totalIncome, totalExpenses, estimatedTax, netProfit, timezone,
}: ProfitLossExcelParams): XLSX.WorkBook {
  const wb  = XLSX.utils.book_new()
  const now = formatInTz(new Date(), timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

  XLSX.utils.book_append_sheet(wb, buildCoverSheet({
    reportTitle: 'Profit & Loss',
    dateRange:   label,
    generatedAt: now,
  }), 'Info')

  // ── Summary sheet ─────────────────────────────────────────
  const sumAoa: any[][] = [
    ['Profit & Loss Summary', label],
    [],
    ['', 'Amount ($)'],
    ['INCOME', ''],
    ...incomeGroups.map((g) => [g.label, g.totalPeriod]),
    ['Total Income', totalIncome],
    [],
    ['EXPENSES', ''],
    ...expenseGroups.map((g) => [g.label, g.totalPeriod]),
    ['Total Expenses', totalExpenses],
    ...(estimatedTax > 0 ? [['Estimated Tax (ATO)', estimatedTax]] : []),
    [],
    ['NET PROFIT / (LOSS)', netProfit],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(sumAoa)
  setCols(ws1, [38, 18])
  styleRow(ws1, 0, 0, 1, headerLeftStyle())
  sc(ws1, 2, 0, headerLeftStyle()); sc(ws1, 2, 1, headerStyle())
  const incomeSecR = 3; const expSecR = 4 + incomeGroups.length + 1
  styleRow(ws1, incomeSecR, 0, 1, sectionStyle())
  styleRow(ws1, expSecR, 0, 1, sectionStyle())
  for (let i = 0; i < incomeGroups.length; i++) {
    const r = 4 + i; const alt = i % 2 === 1
    sc(ws1, r, 0, dataLabelStyle(alt)); sc(ws1, r, 1, positiveStyle(alt))
  }
  const incTotR = 4 + incomeGroups.length
  sc(ws1, incTotR, 0, totalLabelStyle()); sc(ws1, incTotR, 1, totalStyle())
  const expStartR = expSecR + 1
  for (let i = 0; i < expenseGroups.length; i++) {
    const r = expStartR + i; const alt = i % 2 === 1
    sc(ws1, r, 0, dataLabelStyle(alt)); sc(ws1, r, 1, negativeStyle(alt))
  }
  const expTotR = expStartR + expenseGroups.length
  sc(ws1, expTotR, 0, totalLabelStyle()); sc(ws1, expTotR, 1, totalStyle())
  if (estimatedTax > 0) {
    sc(ws1, expTotR + 1, 0, dataLabelStyle()); sc(ws1, expTotR + 1, 1, negativeStyle())
  }
  const netR = sumAoa.length - 1
  sc(ws1, netR, 0, grandTotalLabelStyle())
  sc(ws1, netR, 1, netProfit >= 0
    ? { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 11 } }
    : grandTotalStyle())
  XLSX.utils.book_append_sheet(wb, ws1, 'P&L Summary')

  // ── Income Detail sheet ────────────────────────────────────
  const incAoa: any[][] = [
    ['Income Detail', label],
    ['Category', 'Item', 'Date', 'Status', 'Amount ($)', 'Period Amount ($)'],
  ]
  for (const g of incomeGroups) {
    incAoa.push([g.label, '', '', '', '', g.totalPeriod])
    for (const item of g.items) {
      incAoa.push([
        '', item.name,
        item.date ? formatInTz(new Date(item.date), timezone, { day: 'numeric', month: '2-digit', year: 'numeric' }) : '',
        item.received ? 'Received' : 'Expected',
        item.amount,
        item.periodAmount,
      ])
    }
  }
  incAoa.push([])
  incAoa.push(['TOTAL INCOME', '', '', '', '', totalIncome])
  const ws2 = XLSX.utils.aoa_to_sheet(incAoa)
  setCols(ws2, [28, 30, 14, 12, 16, 18])
  freeze(ws2, 2, 1)
  styleRow(ws2, 0, 0, 5, headerLeftStyle())
  styleRow(ws2, 1, 0, 5, headerStyle())
  sc(ws2, 1, 0, headerLeftStyle()); sc(ws2, 1, 1, headerLeftStyle())
  let ir = 2, iAlt = 0
  for (const g of incomeGroups) {
    styleRow(ws2, ir, 0, 5, sectionStyle())
    ir++
    for (let i = 0; i < g.items.length; i++, ir++, iAlt++) {
      const alt = iAlt % 2 === 1
      sc(ws2, ir, 0, dataLabelStyle(alt))
      sc(ws2, ir, 1, dataLabelStyle(alt))
      sc(ws2, ir, 2, dataLabelStyle(alt))
      sc(ws2, ir, 3, dataLabelStyle(alt))
      sc(ws2, ir, 4, positiveStyle(alt))
      sc(ws2, ir, 5, positiveStyle(alt))
    }
  }
  const incTotalRow = incAoa.length - 1
  sc(ws2, incTotalRow, 0, grandTotalLabelStyle())
  sc(ws2, incTotalRow, 5, grandTotalStyle())
  XLSX.utils.book_append_sheet(wb, ws2, 'Income Detail')

  // ── Expense Detail sheet ──────────────────────────────────
  const expAoa: any[][] = [
    ['Expense Detail', label],
    ['Category', 'Item', 'Date', 'Status', 'Amount ($)', 'Period Amount ($)'],
  ]
  for (const g of expenseGroups) {
    expAoa.push([g.label, '', '', '', '', g.totalPeriod])
    for (const item of g.items) {
      expAoa.push([
        '', item.name,
        item.date ? formatInTz(new Date(item.date), timezone, { day: 'numeric', month: '2-digit', year: 'numeric' }) : '',
        item.paid ? 'Paid' : 'Due',
        item.amount,
        item.periodAmount,
      ])
    }
  }
  expAoa.push([])
  expAoa.push(['TOTAL EXPENSES', '', '', '', '', totalExpenses])
  const ws3 = XLSX.utils.aoa_to_sheet(expAoa)
  setCols(ws3, [28, 30, 14, 12, 16, 18])
  freeze(ws3, 2, 1)
  styleRow(ws3, 0, 0, 5, headerLeftStyle())
  styleRow(ws3, 1, 0, 5, headerStyle())
  sc(ws3, 1, 0, headerLeftStyle()); sc(ws3, 1, 1, headerLeftStyle())
  let er = 2, eAlt = 0
  for (const g of expenseGroups) {
    styleRow(ws3, er, 0, 5, sectionStyle()); er++
    for (let i = 0; i < g.items.length; i++, er++, eAlt++) {
      const alt = eAlt % 2 === 1
      sc(ws3, er, 0, dataLabelStyle(alt)); sc(ws3, er, 1, dataLabelStyle(alt))
      sc(ws3, er, 2, dataLabelStyle(alt)); sc(ws3, er, 3, dataLabelStyle(alt))
      sc(ws3, er, 4, negativeStyle(alt)); sc(ws3, er, 5, negativeStyle(alt))
    }
  }
  const expTotalRow = expAoa.length - 1
  sc(ws3, expTotalRow, 0, grandTotalLabelStyle())
  sc(ws3, expTotalRow, 5, grandTotalStyle())
  XLSX.utils.book_append_sheet(wb, ws3, 'Expense Detail')

  return wb
}
