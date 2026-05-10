// src/lib/reportExcel.ts
// Generates an Excel workbook buffer from a ReportPayload
// Used by both the export route and the email service for attachments

import * as XLSX from 'xlsx'
import type { ReportPayload } from './financeReport'

const CURRENCY_FMT = '$#,##0.00;($#,##0.00);"-"'
const HEADER_BG = 'D9D9D9'
const CATEGORY_BG = 'DEEAF1'
const GRAND_TOTAL_BG = 'BDD7EE'
const GREEN_FONT = '375623'
const RED_FONT = 'C00000'

export function generateExcelBuffer(report: ReportPayload): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Income ──────────────────────────────────────────────────
  const incomeData: any[][] = []
  incomeData.push(['Income', ...report.meta.months, 'Total'])

  for (const section of report.sections) {
    if (section.income.rows.length === 0) continue
    incomeData.push([section.name, ...new Array(report.meta.months.length).fill(''), ''])
    for (const row of section.income.rows) {
      incomeData.push([row.label, ...row.monthly.map(v => v || '-'), row.total])
    }
    incomeData.push(['Subtotal', ...new Array(report.meta.months.length).fill(''), section.income.subtotal])
  }
  incomeData.push(['Total Income', ...new Array(report.meta.months.length).fill(''), report.totals.totalIncome])

  const ws1 = XLSX.utils.aoa_to_sheet(incomeData)
  applySheetStyles(ws1, incomeData, report.meta.months.length)
  XLSX.utils.book_append_sheet(wb, ws1, 'Income')

  // ── Sheet 2: Expenses ────────────────────────────────────────────────
  const expenseData: any[][] = []
  expenseData.push(['Expenses', ...report.meta.months, 'Total'])

  for (const section of report.sections) {
    if (section.expenses.categories.length === 0) continue
    expenseData.push([section.name, ...new Array(report.meta.months.length).fill(''), ''])
    for (const cat of section.expenses.categories) {
      for (const row of cat.rows) {
        expenseData.push([row.label, ...row.monthly.map(v => v || '-'), row.total])
      }
      expenseData.push([`  ${cat.name} subtotal`, ...new Array(report.meta.months.length).fill(''), cat.subtotal])
    }
    expenseData.push([`${section.name} subtotal`, ...new Array(report.meta.months.length).fill(''), section.expenses.subtotal])
  }
  expenseData.push(['Total Expenses', ...new Array(report.meta.months.length).fill(''), report.totals.totalExpenses])

  const ws2 = XLSX.utils.aoa_to_sheet(expenseData)
  applySheetStyles(ws2, expenseData, report.meta.months.length)
  XLSX.utils.book_append_sheet(wb, ws2, 'Expenses')

  // ── Sheet 3: NETT ─────────────────────────────────────────────────────
  const nettData: any[][] = []
  nettData.push(['Entity', ...report.meta.months, 'Total'])

  for (const section of report.sections) {
    nettData.push([
      section.name,
      ...report.meta.months.map((_, i) => {
        const inc = section.income.rows.reduce((s, r) => s + (r.monthly[i] || 0), 0)
        const exp = section.expenses.categories.reduce((s, c) =>
          s + (c.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)), 0)
        return inc - exp
      }),
      section.nett,
    ])
  }
  nettData.push([
    'Total NETT',
    ...report.meta.months.map((_, i) =>
      report.sections.reduce((s, sec) => {
        const inc = sec.income.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)
        const exp = sec.expenses.categories.reduce((sr, c) =>
          sr + (c.rows.reduce((scr, r) => scr + (r.monthly[i] || 0), 0)), 0)
        return s + inc - exp
      }, 0)
    ),
    report.totals.totalNett,
  ])

  const ws3 = XLSX.utils.aoa_to_sheet(nettData)
  applyNettStyles(ws3, nettData, report.meta.months.length)
  XLSX.utils.book_append_sheet(wb, ws3, 'NETT')

  // Write to buffer
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function applySheetStyles(ws: XLSX.WorkSheet, data: any[][], monthCount: number) {
  ws['!cols'] = [{ wch: 24 }, ...new Array(monthCount).fill({ wch: 10 }), { wch: 14 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }

  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    const isHeader = r === 0
    const isSubtotal = String(row?.[0] ?? '').includes('subtotal')
    const isGrandTotal = String(row?.[0] ?? '').startsWith('Total ')
    const isSectionName = !isHeader && !isSubtotal && !isGrandTotal &&
      (row?.[1] === '' || row?.[1] === undefined || row?.[1] === '-') && row?.[0] !== ''

    for (let c = 0; c < row.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      if (!ws[cellRef]) continue
      const cell: XLSX.CellObject = ws[cellRef]
      const val = cell.v
      if (typeof val === 'number') { cell.t = 'n'; cell.z = CURRENCY_FMT }
      if (isHeader) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: HEADER_BG } } }
      else if (isSectionName) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: HEADER_BG } } }
      else if (isSubtotal) cell.s = { font: { italic: true, color: { rgb: '2E75B6' } }, fill: { fgColor: { rgb: CATEGORY_BG } } }
      else if (isGrandTotal) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: GRAND_TOTAL_BG } } }
    }
  }
}

function applyNettStyles(ws: XLSX.WorkSheet, data: any[][], monthCount: number) {
  ws['!cols'] = [{ wch: 24 }, ...new Array(monthCount).fill({ wch: 10 }), { wch: 14 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }

  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    const isHeader = r === 0
    const isGrandTotal = String(row?.[0] ?? '').startsWith('Total ')

    for (let c = 0; c < row.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      if (!ws[cellRef]) continue
      const cell: XLSX.CellObject = ws[cellRef]
      const val = cell.v
      if (typeof val === 'number') { cell.t = 'n'; cell.z = CURRENCY_FMT }
      if (isHeader) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: HEADER_BG } } }
      else if (isGrandTotal) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: GRAND_TOTAL_BG } } }
      else if (typeof val === 'number' && (c === row.length - 1 || c > 0)) {
        if (val > 0) cell.s = { font: { color: { rgb: GREEN_FONT }, bold: true } }
        else if (val < 0) cell.s = { font: { color: { rgb: RED_FONT }, bold: true } }
      }
    }
  }
}
