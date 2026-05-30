// src/app/api/finance/export/excel/route.ts
// Excel download — uses SheetJS (xlsx) to build multi-sheet workbook

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { buildYtdReport, getCurrentFY, fyDateRange } from '@/lib/financeReport'
import * as XLSX from 'xlsx'

const CURRENCY_FMT = '$#,##0.00;($#,##0.00);"-"'
const HEADER_BG = 'D9D9D9'
const CATEGORY_BG = 'DEEAF1'
const SECTION_TOTAL_BG = 'F2F2F2'
const GRAND_TOTAL_BG = 'BDD7EE'
const GREEN_FONT = '375623'
const RED_FONT = 'C00000'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const familyId = user.familyId

    // Load FY start month AND timezone from family settings
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { financeYearStartMonth: true, timezone: true },
    })
    const fyStartMonth = family?.financeYearStartMonth ?? 7
    const tz = family?.timezone ?? DEFAULT_TIMEZONE

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') ?? 'budget' // budget | tax
    const year = searchParams.get('year') ?? getCurrentFY()
    const snapshotId = searchParams.get('snapshotId')

    // Build or load report data
    const report = await buildYtdReport(familyId, year, fyStartMonth, tz)

    const wb = XLSX.utils.book_new()
    const dateStr = year.replace('/', '-')

    // ── Sheet 1: Income ──────────────────────────────────────────────────
    const incomeData: any[][] = []
    // Header row
    const headerRow = ['Income', ...report.meta.months, 'Total']
    incomeData.push(headerRow)

    for (const section of report.sections) {
      if (section.income.rows.length === 0) continue

      // Section header
      incomeData.push([section.name, ...new Array(report.meta.months.length).fill(''), ''])

      for (const row of section.income.rows) {
        incomeData.push([row.label, ...row.monthly.map(v => v || '-'), row.total])
      }

      // Subtotal
      incomeData.push(['Subtotal', ...new Array(report.meta.months.length).fill(''), section.income.subtotal])
    }

    // Grand total
    incomeData.push(['Total Income', ...new Array(report.meta.months.length).fill(''), report.totals.totalIncome])

    const ws1 = XLSX.utils.aoa_to_sheet(incomeData)
    applyStyles(ws1, incomeData, report.meta.months.length)
    XLSX.utils.book_append_sheet(wb, ws1, 'Income')

    // ── Sheet 2: Expenses ────────────────────────────────────────────────
    const expenseData: any[][] = []
    expenseData.push(['Expenses', ...report.meta.months, 'Total'])

    for (const section of report.sections) {
      if (section.expenses.categories.length === 0) continue

      // Section header
      expenseData.push([section.name, ...new Array(report.meta.months.length).fill(''), ''])

      for (const cat of section.expenses.categories) {
        for (const row of cat.rows) {
          expenseData.push([row.label, ...row.monthly.map(v => v || '-'), row.total])
        }
        // Category subtotal
        expenseData.push([`  ${cat.name} subtotal`, ...new Array(report.meta.months.length).fill(''), cat.subtotal])
      }

      // Section subtotal
      expenseData.push([`${section.name} subtotal`, ...new Array(report.meta.months.length).fill(''), section.expenses.subtotal])
    }

    expenseData.push(['Total Expenses', ...new Array(report.meta.months.length).fill(''), report.totals.totalExpenses])

    const ws2 = XLSX.utils.aoa_to_sheet(expenseData)
    applyStyles(ws2, expenseData, report.meta.months.length)
    XLSX.utils.book_append_sheet(wb, ws2, 'Expenses')

    // ── Sheet 3: NETT ─────────────────────────────────────────────────────
    const nettData: any[][] = []
    nettData.push(['Entity', ...report.meta.months, 'Total'])

    for (const section of report.sections) {
      nettData.push([
        section.name,
        ...report.meta.months.map((_, i) => {
          const inc = section.income.rows.reduce((s, r) => s + (r.monthly[i] || 0), 0)
          const exp = section.expenses.categories.reduce((s, c) => s + (c.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)), 0)
          return inc - exp
        }),
        section.nett,
      ])
    }

    nettData.push([
      'Total NETT',
      ...report.meta.months.map((_, i) => {
        return report.sections.reduce((s, sec) => {
          const inc = sec.income.rows.reduce((sr, r) => sr + (r.monthly[i] || 0), 0)
          const exp = sec.expenses.categories.reduce((sr, c) => sr + (c.rows.reduce((scr, r) => scr + (r.monthly[i] || 0), 0)), 0)
          return s + inc - exp
        }, 0)
      }),
      report.totals.totalNett,
    ])

    const ws3 = XLSX.utils.aoa_to_sheet(nettData)
    applyNettStyles(ws3, nettData, report.meta.months.length)
    XLSX.utils.book_append_sheet(wb, ws3, 'NETT')

    // ── Sheet 4: Tax Summary (only in tax mode) ─────────────────────────
    if (mode === 'tax' && report.tax) {
      const taxData: any[][] = []
      taxData.push(['Tax Summary', '', '', '', ''])
      taxData.push([])

      // Member columns
      const membersList = report.tax.byMember
      const maxMembers = Math.max(membersList.length, 1)

      for (let mi = 0; mi < maxMembers; mi++) {
        const m = membersList[mi]
        if (mi > 0) taxData.push([]) // spacer between members

        taxData.push([m?.memberName ?? `Member ${mi + 1}`, '', '', '', ''])
        taxData.push(['Wages', m?.taxableIncome ?? 0, '', '', ''])
        taxData.push(['Bank Interest', 0, '', '', ''])
        taxData.push(['Other Income', 0, '', '', ''])
        taxData.push(['Total Income', m?.taxableIncome ?? 0, '', '', ''])
        taxData.push([])
        taxData.push(['Super Contributions (SGC)', m?.sgcEmployer ?? 0, '', '', ''])
        taxData.push(['Other Deductions', m?.deductions ?? 0, '', '', ''])
        taxData.push(['Total Deductions', (m?.sgcEmployer ?? 0) + (m?.deductions ?? 0), '', '', ''])
        taxData.push([])
        taxData.push(['Total Taxable', m?.totalTaxable ?? 0, '', '', ''])
        taxData.push(['Tax Payable', m?.estimatedTaxPayable ?? 0, '', '', ''])
        taxData.push(['PAYG Withheld', m?.paygWithheld ?? 0, '', '', ''])
        taxData.push(['PAYG Instalments', m?.taxPayments ?? 0, '', '', ''])
        taxData.push(['Tax Credit for Divs', m?.taxCreditForDivs ?? 0, '', '', ''])
        taxData.push([])

        const refundOrOwing = m?.estimatedRefundOrOwing ?? (m ? -(m.estimatedTaxPayable - m.paygWithheld - m.taxPayments) : 0)
        taxData.push([
          'NET REFUND / (OWING)',
          refundOrOwing,
          '', '', '',
        ])
      }

      // Disclaimer
      taxData.push([])
      taxData.push(['Estimated only — based on ATO tax brackets. Consult your accountant.', '', '', '', ''])

      const ws4 = XLSX.utils.aoa_to_sheet(taxData)
      // Apply amber/red fill on refund/owing row
      for (let r = 0; r < taxData.length; r++) {
        if (String(taxData[r]?.[0] ?? '').startsWith('NET REFUND')) {
          const cellRef = XLSX.utils.encode_cell({ r, c: 1 })
          if (ws4[cellRef]) {
            const val = ws4[cellRef].v
            ws4[cellRef].s = {
              font: { bold: true, color: { rgb: val >= 0 ? GREEN_FONT : RED_FONT } },
              fill: { fgColor: { rgb: val >= 0 ? 'C6EFCE' : 'FFC7CE' } },
              numFmt: CURRENCY_FMT,
            }
          }
        }
      }
      // Column widths
      ws4['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, ws4, 'Tax Summary')
    }

    // ── Write workbook to buffer ─────────────────────────────────────────
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Homebase_Finance_${dateStr}.xlsx"`,
        'Content-Length': String(buf.byteLength),
      },
    })
  } catch (err) {
    console.error('[export/excel]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function applyStyles(ws: XLSX.WorkSheet, data: any[][], monthCount: number) {
  // Column widths: A=24, month cols=10, total=14
  const colWidths = [{ wch: 24 }, ...new Array(monthCount).fill({ wch: 10 }), { wch: 14 }]
  ws['!cols'] = colWidths

  // Freeze panes: row 1 + column A
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }

  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    const isHeader = r === 0
    const isSectionHeader = row?.[0] && !isHeader && ['Personal', 'SUPER', 'Unitrak', 'Hopevale'].includes(String(row[0]).toUpperCase())
      ? false // We'll check if it's a section by checking if it's not a subtotal/grand total
      : false
    const isSubtotal = String(row?.[0] ?? '').includes('subtotal')
    const isGrandTotal = String(row?.[0] ?? '').startsWith('Total ')
    const isSectionName = !isHeader && !isSubtotal && !isGrandTotal && (row?.[1] === '' || row?.[1] === undefined || row?.[1] === '-') && row?.[0] !== ''

    for (let c = 0; c < row.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      if (!ws[cellRef]) continue

      const cell: XLSX.CellObject = ws[cellRef]
      const val = cell.v

      // Default currency format for number cells in data columns
      if (typeof val === 'number') {
        cell.t = 'n'
        cell.z = CURRENCY_FMT
      }

      if (isHeader) {
        cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: HEADER_BG } } }
      } else if (isSectionName) {
        // Section name row
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: HEADER_BG } } }
      } else if (isSubtotal) {
        cell.s = { font: { italic: true, color: { rgb: '2E75B6' } }, fill: { fgColor: { rgb: CATEGORY_BG } } }
      } else if (isGrandTotal) {
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: GRAND_TOTAL_BG } } }
      }
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

      if (typeof val === 'number') {
        cell.t = 'n'
        cell.z = CURRENCY_FMT
      }

      if (isHeader) {
        cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: HEADER_BG } } }
      } else if (isGrandTotal) {
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: GRAND_TOTAL_BG } } }
      } else if (typeof val === 'number') {
        // Colour the NETT values: green for positive, red for negative
        if (c === row.length - 1 || c > 0) {
          if (val > 0) {
            cell.s = { font: { color: { rgb: GREEN_FONT }, bold: true } }
          } else if (val < 0) {
            cell.s = { font: { color: { rgb: RED_FONT }, bold: true } }
          }
        }
      }
    }
  }
}
