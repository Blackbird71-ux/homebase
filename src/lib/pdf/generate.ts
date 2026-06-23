// src/lib/pdf/generate.ts
// Server-side PDF generation helpers using pdf-lib.
// All functions return a Uint8Array buffer ready to be served or saved to disk.

import { PDFDocument, StandardFonts, rgb, PageSizes, type PDFFont, type PDFPage } from 'pdf-lib'

// ─── Colour palette ───────────────────────────────────────────────────────────

const COLORS = {
  black:     rgb(0.1, 0.1, 0.1),
  darkGray:  rgb(0.4, 0.4, 0.4),
  midGray:   rgb(0.6, 0.6, 0.6),
  lightGray: rgb(0.85, 0.85, 0.85),
  white:     rgb(1, 1, 1),
  green:     rgb(0.09, 0.63, 0.29),
  red:       rgb(0.86, 0.15, 0.15),
  orange:    rgb(0.92, 0.50, 0.05),
  blue:      rgb(0.15, 0.39, 0.89),
  border:    rgb(0.82, 0.82, 0.82),
}

// ─── Layout constants (A4 portrait) ────────────────────────────────────────────

const PAGE_W = PageSizes.A4[0]  // 595.28
const PAGE_H = PageSizes.A4[1]  // 841.89
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2  // 495.28
const LINE_H = 14
const HEADER_H = 40
const FOOTER_H = 30

// ─── Font helpers ─────────────────────────────────────────────────────────────

async function loadFonts(doc: PDFDocument) {
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono   = await doc.embedFont(StandardFonts.Courier)
  return { regular, bold, mono }
}

// ─── Page helpers ──────────────────────────────────────────────────────────────

interface PageLayout {
  doc: PDFDocument
  font: { regular: PDFFont; bold: PDFFont; mono: PDFFont }
  page: PDFPage
  y: number   // current drawing y-position (top-down)
  pageNum: number
}

function addPage(layout: PageLayout): void {
  const { doc, font } = layout
  const page = doc.addPage(PageSizes.A4)
  layout.page = page
  layout.y = PAGE_H - MARGIN
  layout.pageNum++
  drawHeader(page, layout.pageNum, font)
}

function drawHeader(page: PDFPage, pageNum: number, font: { regular: PDFFont; bold: PDFFont }) {
  // Header line
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN + 10 },
    end:   { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN + 10 },
    thickness: 1,
    color: COLORS.border,
  })
  // Page number
  page.drawText(`Page ${pageNum}`, {
    x: PAGE_W - MARGIN - font.regular.widthOfTextAtSize(`Page ${pageNum}`, 8),
    y: PAGE_H - MARGIN + 16,
    size: 8,
    font: font.regular,
    color: COLORS.darkGray,
  })
}

function drawFooter(page: PDFPage, text: string, font: { regular: PDFFont }) {
  page.drawLine({
    start: { x: MARGIN, y: MARGIN - 5 },
    end:   { x: PAGE_W - MARGIN, y: MARGIN - 5 },
    thickness: 0.5,
    color: COLORS.border,
  })
  page.drawText(text, {
    x: MARGIN,
    y: MARGIN - 16,
    size: 7,
    font: font.regular,
    color: COLORS.darkGray,
  })
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

function checkPageBreak(layout: PageLayout, needed: number): void {
  if (layout.y - needed < MARGIN + FOOTER_H) {
    addPage(layout)
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface PdfTableColumn {
  header: string
  key: string
  width: number       // fraction of available content width (0-1)
  align?: 'left' | 'right'
  format?: 'text' | 'currency'
}

export interface PdfTableRow {
  [key: string]: string | number
}

export interface PdfReportMeta {
  title: string
  subtitle?: string
  dateRange?: string
  generatedAt?: string
}

/**
 * Generate a PDF from structured table data.
 * Produces a professional A4 document with headers, footers, and styled tables.
 */
export async function generateTablePdf(
  meta: PdfReportMeta,
  columns: PdfTableColumn[],
  rows: PdfTableRow[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await loadFonts(doc)
  const page = doc.addPage(PageSizes.A4)

  const layout: PageLayout = {
    doc, font, page,
    y: PAGE_H - MARGIN - HEADER_H,
    pageNum: 1,
  }

  drawHeader(page, 1, font)

  // ── Title ──────────────────────────────────────────────────────────────────
  layout.y -= 4
  page.drawText(meta.title, {
    x: MARGIN, y: layout.y,
    size: 18, font: font.bold, color: COLORS.black,
  })
  layout.y -= 22

  if (meta.subtitle) {
    page.drawText(meta.subtitle, {
      x: MARGIN, y: layout.y,
      size: 10, font: font.regular, color: COLORS.darkGray,
    })
    layout.y -= 16
  }

  if (meta.dateRange) {
    page.drawText(meta.dateRange, {
      x: MARGIN, y: layout.y,
      size: 9, font: font.regular, color: COLORS.darkGray,
    })
    layout.y -= 14
  }

  if (meta.generatedAt) {
    page.drawText(`Generated: ${meta.generatedAt}`, {
      x: MARGIN, y: layout.y,
      size: 8, font: font.regular, color: COLORS.midGray,
    })
    layout.y -= 18
  }

  layout.y -= 6

  // ── Table header ───────────────────────────────────────────────────────────
  const tableLeft = MARGIN
  const totalWidth = CONTENT_W
  const rowH = 18
  const cellPad = 4
  const fontSize = 8

  checkPageBreak(layout, rowH + 4)

  // Header background
  page.drawRectangle({
    x: tableLeft, y: layout.y - rowH,
    width: totalWidth, height: rowH,
    color: COLORS.lightGray,
  })

  let colX = tableLeft
  for (const col of columns) {
    const w = totalWidth * col.width
    page.drawText(col.header, {
      x: colX + cellPad,
      y: layout.y - rowH + 5,
      size: fontSize,
      font: font.bold,
      color: COLORS.black,
    })
    colX += w
  }

  // Header bottom border
  page.drawLine({
    start: { x: tableLeft, y: layout.y - rowH },
    end:   { x: tableLeft + totalWidth, y: layout.y - rowH },
    thickness: 0.5,
    color: COLORS.darkGray,
  })

  layout.y -= rowH

  // ── Table rows ─────────────────────────────────────────────────────────────
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    checkPageBreak(layout, rowH + 2)

    // Alternating row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: tableLeft, y: layout.y - rowH,
        width: totalWidth, height: rowH,
        color: rgb(0.97, 0.97, 0.97),
      })
    }

    colX = tableLeft
    for (const col of columns) {
      const w = totalWidth * col.width
      const val = row[col.key]
      let text = val != null ? String(val) : ''

      // Format currency values
      if (col.format === 'currency' && typeof val === 'number') {
        text = `$${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
        // Negative values in red
        if (val < 0) {
          page.drawText(text, {
            x: colX + w - cellPad - font.regular.widthOfTextAtSize(text, fontSize),
            y: layout.y - rowH + 5,
            size: fontSize,
            font: font.regular,
            color: COLORS.red,
          })
          colX += w
          continue
        }
      }

      const x = col.align === 'right'
        ? colX + w - cellPad - font.regular.widthOfTextAtSize(text, fontSize)
        : colX + cellPad

      page.drawText(text, {
        x, y: layout.y - rowH + 5,
        size: fontSize,
        font: font.regular,
        color: COLORS.black,
      })
      colX += w
    }

    // Row bottom border
    page.drawLine({
      start: { x: tableLeft, y: layout.y - rowH },
      end:   { x: tableLeft + totalWidth, y: layout.y - rowH },
      thickness: 0.3,
      color: COLORS.border,
    })

    layout.y -= rowH
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  drawFooter(page, `HomeBase · ${meta.title}`, font)

  return doc.save()
}

/**
 * Generate a simple text-based PDF document.
 * Useful for notes, summaries, or any content that's plain text.
 */
export async function generateTextPdf(
  title: string,
  bodyLines: string[],
  subtitle?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await loadFonts(doc)
  const page = doc.addPage(PageSizes.A4)

  const layout: PageLayout = {
    doc, font, page,
    y: PAGE_H - MARGIN - HEADER_H,
    pageNum: 1,
  }

  drawHeader(page, 1, font)

  // Title
  layout.y -= 4
  page.drawText(title, {
    x: MARGIN, y: layout.y,
    size: 16, font: font.bold, color: COLORS.black,
  })
  layout.y -= 20

  if (subtitle) {
    page.drawText(subtitle, {
      x: MARGIN, y: layout.y,
      size: 9, font: font.regular, color: COLORS.darkGray,
    })
    layout.y -= 16
  }

  layout.y -= 4

  // Body text
  const bodySize = 10
  for (const line of bodyLines) {
    if (line === '---') {
      // Horizontal rule
      checkPageBreak(layout, LINE_H)
      page.drawLine({
        start: { x: MARGIN, y: layout.y },
        end:   { x: PAGE_W - MARGIN, y: layout.y },
        thickness: 0.5,
        color: COLORS.border,
      })
      layout.y -= LINE_H
      continue
    }

    const wrapped = wrapText(line, font.regular, bodySize, CONTENT_W)
    checkPageBreak(layout, wrapped.length * LINE_H + 4)

    for (const wl of wrapped) {
      page.drawText(wl, {
        x: MARGIN, y: layout.y,
        size: bodySize, font: font.regular, color: COLORS.black,
      })
      layout.y -= LINE_H
    }
  }

  drawFooter(page, `HomeBase · ${title}`, font)

  return doc.save()
}

// ─── Document builder (ordered sections) ───────────────────────────────────────

export interface PdfBuilderMeta {
  title: string
  subtitle?: string
}

/** An ordered content block in a built-from-scratch document. */
export type PdfSection =
  | { type: 'heading'; text: string; level?: 1 | 2 }
  | { type: 'paragraph'; text: string }
  | { type: 'divider' }
  | { type: 'image'; data: string; mimeType: 'image/jpeg' | 'image/png' }

/** Decode a base64 data URL into raw bytes (server-side). */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  try {
    return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), 'base64'))
  } catch {
    return null
  }
}

/**
 * Generate a PDF by composing an ordered list of sections (headings, paragraphs,
 * dividers, embedded images). This is the "build from scratch" path — richer than
 * the fixed blank/text templates.
 */
export async function generateSectionedPdf(
  meta: PdfBuilderMeta,
  sections: PdfSection[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await loadFonts(doc)
  const page = doc.addPage(PageSizes.A4)

  const layout: PageLayout = {
    doc, font, page,
    y: PAGE_H - MARGIN - HEADER_H,
    pageNum: 1,
  }

  drawHeader(page, 1, font)

  // ── Title ────────────────────────────────────────────────────────────────────
  layout.y -= 4
  layout.page.drawText(meta.title, {
    x: MARGIN, y: layout.y,
    size: 18, font: font.bold, color: COLORS.black,
  })
  layout.y -= 24

  if (meta.subtitle) {
    layout.page.drawText(meta.subtitle, {
      x: MARGIN, y: layout.y,
      size: 10, font: font.regular, color: COLORS.darkGray,
    })
    layout.y -= 18
  }

  layout.y -= 6

  // ── Sections ─────────────────────────────────────────────────────────────────
  for (const section of sections) {
    switch (section.type) {
      case 'heading': {
        const size = section.level === 2 ? 12 : 14
        const wrapped = wrapText(section.text, font.bold, size, CONTENT_W)
        checkPageBreak(layout, wrapped.length * (size + 4) + 10)
        layout.y -= 6
        for (const wl of wrapped) {
          layout.page.drawText(wl, {
            x: MARGIN, y: layout.y,
            size, font: font.bold, color: COLORS.black,
          })
          layout.y -= size + 4
        }
        layout.y -= 2
        break
      }

      case 'paragraph': {
        const size = 10
        if (!section.text.trim()) {
          layout.y -= LINE_H
          break
        }
        for (const para of section.text.split('\n')) {
          const wrapped = wrapText(para, font.regular, size, CONTENT_W)
          checkPageBreak(layout, wrapped.length * LINE_H + 4)
          for (const wl of wrapped) {
            layout.page.drawText(wl, {
              x: MARGIN, y: layout.y,
              size, font: font.regular, color: COLORS.black,
            })
            layout.y -= LINE_H
          }
        }
        layout.y -= 4
        break
      }

      case 'divider': {
        checkPageBreak(layout, LINE_H)
        layout.y -= 4
        layout.page.drawLine({
          start: { x: MARGIN, y: layout.y },
          end:   { x: PAGE_W - MARGIN, y: layout.y },
          thickness: 0.5,
          color: COLORS.border,
        })
        layout.y -= LINE_H
        break
      }

      case 'image': {
        const bytes = dataUrlToBytes(section.data)
        if (!bytes) break
        let img
        try {
          img = section.mimeType === 'image/png'
            ? await doc.embedPng(bytes)
            : await doc.embedJpg(bytes)
        } catch {
          break // malformed image data — skip
        }
        // Scale to fit content width, and never exceed one page's drawable height.
        const maxImgH = PAGE_H - MARGIN - HEADER_H - MARGIN - FOOTER_H
        let scale = Math.min(CONTENT_W / img.width, 1)
        if (img.height * scale > maxImgH) scale = maxImgH / img.height
        const w = img.width * scale
        const h = img.height * scale
        checkPageBreak(layout, h + 8)
        layout.y -= h
        layout.page.drawImage(img, { x: MARGIN, y: layout.y, width: w, height: h })
        layout.y -= 8
        break
      }
    }
  }

  drawFooter(layout.page, `HomeBase · ${meta.title}`, font)

  return doc.save()
}

/**
 * Generate a simple blank-page PDF that acts as a template placeholder.
 * Useful as a starting point for the Generate PDF dialog.
 */
export async function generateBlankPdf(title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await loadFonts(doc)
  const page = doc.addPage(PageSizes.A4)

  page.drawText(title, {
    x: MARGIN, y: PAGE_H - MARGIN - 50,
    size: 22, font: font.bold, color: COLORS.black,
  })

  page.drawText('Generated by HomeBase', {
    x: MARGIN, y: PAGE_H - MARGIN - 72,
    size: 10, font: font.regular, color: COLORS.darkGray,
  })

  drawFooter(page, `HomeBase · ${title}`, font)

  return doc.save()
}
