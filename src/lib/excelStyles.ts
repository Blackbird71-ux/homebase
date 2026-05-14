/**
 * excelStyles.ts — shared SheetJS formatting helpers for all financial report Excel exports.
 *
 * Colour palette follows industry-standard financial model conventions:
 *   Dark navy header, mid-blue sections, light-blue totals, green/red for +/-.
 */

import * as XLSX from 'xlsx'

// ── Colour constants ──────────────────────────────────────────────────────────
export const C = {
  HEADER_BG:      '1F3864',
  HEADER_FG:      'FFFFFF',
  SECTION_BG:     '2E75B6',
  SECTION_FG:     'FFFFFF',
  SUBSECTION_BG:  'D6E4F0',
  SUBSECTION_FG:  '1F3864',
  TOTAL_BG:       'BDD7EE',
  TOTAL_FG:       '000000',
  GRAND_BG:       '1F3864',
  GRAND_FG:       'FFFFFF',
  ALT_ROW:        'F7FAFD',
  GREEN:          '375623',
  RED:            'C00000',
  AMBER_BG:       'FFF2CC',
  AMBER_FG:       '7F6000',
} as const

// ── Number formats ────────────────────────────────────────────────────────────
export const FMT = {
  CURRENCY: '$#,##0.00;($#,##0.00);"-"',
  DATE:     'dd/mm/yyyy',
  INT:      '#,##0;(#,##0);"-"',
} as const

// ── Border helper ─────────────────────────────────────────────────────────────
function border(hex = 'BFBFBF') {
  const s = { style: 'thin', color: { rgb: hex } }
  return { top: s, bottom: s, left: s, right: s }
}

// ── Style builders ────────────────────────────────────────────────────────────
export type XStyle = Record<string, any>

export function headerStyle(bg = C.HEADER_BG, fg = C.HEADER_FG): XStyle {
  return {
    font:      { bold: true, color: { rgb: fg }, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border:    border(),
  }
}

export function headerLeftStyle(bg = C.HEADER_BG, fg = C.HEADER_FG): XStyle {
  return {
    font:      { bold: true, color: { rgb: fg }, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    border(),
  }
}

export function sectionStyle(): XStyle {
  return {
    font:      { bold: true, color: { rgb: C.SECTION_FG }, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: C.SECTION_BG } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    border(),
  }
}

export function subSectionStyle(): XStyle {
  return {
    font:      { bold: true, color: { rgb: C.SUBSECTION_FG }, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: C.SUBSECTION_BG } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
    border:    border(),
  }
}

export function totalLabelStyle(bg = C.TOTAL_BG): XStyle {
  return {
    font:      { bold: true, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    border(),
  }
}

export function totalStyle(bg = C.TOTAL_BG): XStyle {
  return {
    font:      { bold: true, name: 'Arial', sz: 10 },
    fill:      { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border:    border(),
    numFmt:    FMT.CURRENCY,
  }
}

export function grandTotalLabelStyle(): XStyle {
  return {
    font:      { bold: true, color: { rgb: C.GRAND_FG }, name: 'Arial', sz: 11 },
    fill:      { patternType: 'solid', fgColor: { rgb: C.GRAND_BG } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    border(),
  }
}

export function grandTotalStyle(): XStyle {
  return {
    font:      { bold: true, color: { rgb: C.GRAND_FG }, name: 'Arial', sz: 11 },
    fill:      { patternType: 'solid', fgColor: { rgb: C.GRAND_BG } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border:    border(),
    numFmt:    FMT.CURRENCY,
  }
}

export function dataLabelStyle(alt = false, indent = 0): XStyle {
  return {
    font:      { name: 'Arial', sz: 10 },
    fill:      alt ? { patternType: 'solid', fgColor: { rgb: C.ALT_ROW } } : { patternType: 'none' },
    alignment: { horizontal: 'left', vertical: 'center', indent },
    border:    border('D8D8D8'),
  }
}

export function dataStyle(alt = false, numFmt = FMT.CURRENCY): XStyle {
  return {
    font:      { name: 'Arial', sz: 10 },
    fill:      alt ? { patternType: 'solid', fgColor: { rgb: C.ALT_ROW } } : { patternType: 'none' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border:    border('D8D8D8'),
    numFmt,
  }
}

export function positiveStyle(alt = false): XStyle {
  return { ...dataStyle(alt), font: { name: 'Arial', sz: 10, color: { rgb: C.GREEN }, bold: true } }
}

export function negativeStyle(alt = false): XStyle {
  return { ...dataStyle(alt), font: { name: 'Arial', sz: 10, color: { rgb: C.RED }, bold: true } }
}

export function disclaimerStyle(): XStyle {
  return {
    font:      { italic: true, color: { rgb: C.AMBER_FG }, name: 'Arial', sz: 9 },
    fill:      { patternType: 'solid', fgColor: { rgb: C.AMBER_BG } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  }
}

// ── Worksheet helpers ─────────────────────────────────────────────────────────

export function sc(ws: XLSX.WorkSheet, r: number, c: number, style: XStyle) {
  const ref = XLSX.utils.encode_cell({ r, c })
  if (!ws[ref]) ws[ref] = { t: 'z', v: '' }
  ws[ref].s = style
  if (style.numFmt) ws[ref].z = style.numFmt
}

export function setCols(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(wch => ({ wch }))
}

export function freeze(ws: XLSX.WorkSheet, rows = 1, cols = 1) {
  ws['!freeze'] = { xSplit: cols, ySplit: rows }
}

export function mergeCells(ws: XLSX.WorkSheet, r1: number, c1: number, r2: number, c2: number) {
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } })
}

export function styleRow(ws: XLSX.WorkSheet, row: number, c0: number, c1: number, style: XStyle) {
  for (let c = c0; c <= c1; c++) sc(ws, row, c, style)
}

// ── Cover sheet builder ───────────────────────────────────────────────────────

export interface CoverMeta {
  reportTitle: string
  dateRange:   string
  entity?:     string
  generatedAt: string
  disclaimer?: string
}

export function buildCoverSheet(meta: CoverMeta): XLSX.WorkSheet {
  const disclaimer = meta.disclaimer ??
    'These figures are generated from HomeBase financial records. ' +
    'They are for information purposes only. Verify all figures with ' +
    'your registered accountant or tax agent before making any ' +
    'financial or legal decisions.'

  const rows: any[][] = [
    [],
    ['', 'HomeBase — Financial Report'],
    [],
    ['', 'Report',    meta.reportTitle],
    ['', 'Period',    meta.dateRange],
    ...(meta.entity ? [['', 'Entity', meta.entity]] : []),
    ['', 'Generated', meta.generatedAt],
    [],
    ['', disclaimer],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  setCols(ws, [3, 28, 42])

  // Title row
  const titleRef = XLSX.utils.encode_cell({ r: 1, c: 1 })
  if (ws[titleRef]) {
    ws[titleRef].s = {
      font:      { bold: true, sz: 16, name: 'Arial', color: { rgb: C.HEADER_BG } },
      alignment: { horizontal: 'left', vertical: 'center' },
    }
  }

  // Meta rows
  const metaRows = [3, 4, 5, 6, 7].filter(r => rows[r]?.[1])
  for (const r of metaRows) {
    const labelRef = XLSX.utils.encode_cell({ r, c: 1 })
    const valRef   = XLSX.utils.encode_cell({ r, c: 2 })
    if (ws[labelRef]) ws[labelRef].s = { font: { bold: true, sz: 10, name: 'Arial', color: { rgb: C.HEADER_BG } } }
    if (ws[valRef])   ws[valRef].s   = { font: { sz: 10, name: 'Arial' } }
  }

  // Disclaimer — find it and style it
  const discIdx = rows.findIndex(r => typeof r[1] === 'string' && r[1].length > 40)
  if (discIdx >= 0) {
    mergeCells(ws, discIdx, 1, discIdx, 2)
    sc(ws, discIdx, 1, disclaimerStyle())
    ws['!rows'] = ws['!rows'] ?? []
    ws['!rows'][discIdx] = { hpt: 48 }
  }

  return ws
}

// ── Workbook downloader ───────────────────────────────────────────────────────

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
