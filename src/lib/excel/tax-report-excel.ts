import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { SUPER_CAP } from '@/lib/tax-calculator'
import { formatCurrency } from '@/lib/financeShared'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle,
  setCols, freeze, styleRow, sc,
} from '@/lib/excelStyles'

interface TaxColumn {
  wages: number; bankInterest: number; otherIncome: number; frankingCredits: number
  grossIncome: number; voluntarySuper: number; charity: number; otherDeductions: number
  totalDeductions: number; taxableIncome: number; perWeek: number
  incomeTax: number; medicare: number; totalTaxPayable: number
  paygWithheld: number; paygInstalments: number; frankingOffset: number
  totalCredits: number; refundOrOwing: number
  sgcAmount: number; voluntarySuperForCap: number
}

interface PersonData {
  member: { id: string; name: string }
  tax: { actuals: TaxColumn; projected: TaxColumn }
}

export interface TaxReportExcelParams {
  fyStr: string
  financialYear: string
  personData: PersonData[]
}

export function buildTaxReportWorkbook({
  fyStr, financialYear, personData,
}: TaxReportExcelParams): XLSX.WorkBook {
  const wb  = XLSX.utils.book_new()
  const now = format(new Date(), 'd MMM yyyy h:mm a')

  XLSX.utils.book_append_sheet(wb, buildCoverSheet({
    reportTitle: 'Tax Report',
    dateRange:   fyStr,
    generatedAt: now,
    disclaimer:  'Actuals are GL-sourced (authoritative). Projected figures are annualised estimates only — based on 2025-26 ATO tax brackets. This is not tax advice. Consult your registered tax agent or accountant before lodging.',
  }), 'Info')

  const colGroups = personData.flatMap(p => [
    `${p.member.name} (Actuals)`,
    `${p.member.name} (Projected)`,
  ])
  const cols = [32, ...personData.flatMap(() => [18, 18])]
  const aoa: any[][] = []
  aoa.push([`Tax Report — ${fyStr}`, ...colGroups.map(() => '')])
  aoa.push(['', ...colGroups])

  const pushSection = (label: string) => aoa.push([label, ...colGroups.map(() => '')])
  const pushRow = (label: string, vals: (number | string)[]) => aoa.push([label, ...vals])
  const pCols = (getter: (col: TaxColumn) => number) =>
    personData.flatMap(p => [getter(p.tax.actuals), getter(p.tax.projected)])

  pushSection('GROSS INCOME')
  pushRow('Wages / Salary',           pCols(c => c.wages))
  pushRow('Bank Interest (joint ÷2)', pCols(c => c.bankInterest))
  pushRow('Other Income',             pCols(c => c.otherIncome))
  pushRow('Franking Credits',         pCols(c => c.frankingCredits))
  pushRow('Total Gross Income',       pCols(c => c.grossIncome))

  aoa.push([])
  pushSection('DEDUCTIONS')
  pushRow('Voluntary Super',          pCols(c => c.voluntarySuper))
  pushRow('Charity / Gifts',          pCols(c => c.charity))
  pushRow('Other Deductions',         pCols(c => c.otherDeductions))
  pushRow('Total Deductions',         pCols(c => c.totalDeductions))

  aoa.push([])
  pushSection('TAXABLE INCOME')
  pushRow('Total Taxable Income',     pCols(c => c.taxableIncome))
  pushRow('Per Week',                 pCols(c => c.perWeek))

  aoa.push([])
  pushSection('TAX CALCULATION')
  pushRow('Income Tax (brackets)',    pCols(c => c.incomeTax))
  pushRow('Medicare Levy (2%)',       pCols(c => c.medicare))
  pushRow('Less: Franking Credits',   pCols(c => -c.frankingOffset))
  pushRow('Tax Payable',              pCols(c => c.totalTaxPayable))

  aoa.push([])
  pushSection('TAX ALREADY PAID')
  pushRow('PAYG Withheld',            pCols(c => c.paygWithheld))
  pushRow('PAYG Instalments',         pCols(c => c.paygInstalments))
  pushRow('Total Credits',            pCols(c => c.totalCredits))

  aoa.push([])
  pushSection('RESULT')
  pushRow('REFUND / (OWING)',         pCols(c => c.refundOrOwing))

  aoa.push([])
  pushSection('SUPER CAP')
  const cap = SUPER_CAP[financialYear] ?? 30_000
  const capFmt = formatCurrency(cap, { maximumFractionDigits: 0 })
  pushRow(`Super Cap (${capFmt})`,    pCols(() => cap))
  pushRow('SGC (Employer)',           pCols(c => c.sgcAmount))
  pushRow('Voluntary Super',          pCols(c => c.voluntarySuperForCap))
  pushRow('Total Used',               pCols(c => c.sgcAmount + c.voluntarySuperForCap))
  pushRow('Remaining',                pCols(c => Math.max(0, cap - c.sgcAmount - c.voluntarySuperForCap)))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  setCols(ws, cols)
  freeze(ws, 2, 1)

  const numCols = colGroups.length
  styleRow(ws, 0, 0, numCols, headerLeftStyle())
  styleRow(ws, 1, 0, numCols, headerStyle())
  sc(ws, 1, 0, headerLeftStyle())

  const sectionRows = ['GROSS INCOME', 'DEDUCTIONS', 'TAXABLE INCOME', 'TAX CALCULATION', 'TAX ALREADY PAID', 'RESULT', 'SUPER CAP']
  const totalRows   = ['Total Gross Income', 'Total Deductions', 'Total Taxable Income', 'Tax Payable', 'Total Credits']
  const grandRows   = ['REFUND / (OWING)']

  let dataIdx = 0
  for (let r = 2; r < aoa.length; r++) {
    const row = aoa[r]
    if (!row?.length || !row[0]) { dataIdx = 0; continue }
    const lbl = String(row[0])
    if (sectionRows.includes(lbl)) {
      styleRow(ws, r, 0, numCols, sectionStyle()); dataIdx = 0
    } else if (totalRows.includes(lbl)) {
      sc(ws, r, 0, totalLabelStyle())
      for (let c = 1; c <= numCols; c++) sc(ws, r, c, totalStyle())
    } else if (grandRows.includes(lbl)) {
      sc(ws, r, 0, grandTotalLabelStyle())
      for (let c = 1; c <= numCols; c++) {
        const val = row[c] as number
        sc(ws, r, c, val >= 0
          ? { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 11 } }
          : { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFC7CE' }, name: 'Arial', sz: 11 } })
      }
    } else {
      const alt = dataIdx % 2 === 1
      sc(ws, r, 0, dataLabelStyle(alt))
      for (let c = 1; c <= numCols; c++) sc(ws, r, c, dataStyle(alt))
      dataIdx++
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Tax Summary')

  return wb
}
