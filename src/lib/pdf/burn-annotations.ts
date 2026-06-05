// src/lib/pdf/burn-annotations.ts
// Server-side function that burns annotations into a PDF using pdf-lib.
// Takes a PDF buffer + annotation array and returns a new PDF with annotations
// drawn directly onto the page content (not as sidecar data).

import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import type { PdfAnnotation } from '@/types/pdf-annotations'

/**
 * Convert normalised annotation coordinates (0-1, top-left origin) to
 * PDF page coordinates (points, bottom-left origin).
 */
function toPdfPoint(
  nx: number,
  ny: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } {
  return {
    x: nx * pageWidth,
    y: (1 - ny) * pageHeight, // flip Y: top-left -> bottom-left
  }
}

/**
 * Parse a hex colour string into pdf-lib's rgb() format.
 * Supports "#RRGGBB" and "#RGB" formats.
 */
function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  let r: number, g: number, b: number
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255
    g = parseInt(clean[1] + clean[1], 16) / 255
    b = parseInt(clean[2] + clean[2], 16) / 255
  } else {
    r = parseInt(clean.substring(0, 2), 16) / 255
    g = parseInt(clean.substring(2, 4), 16) / 255
    b = parseInt(clean.substring(4, 6), 16) / 255
  }
  return rgb(r, g, b)
}

/**
 * Draw a single annotation on a PDF page.
 */
function drawAnnotation(
  page: PDFPage,
  annotation: PdfAnnotation,
  pageWidth: number,
  pageHeight: number,
): void {
  const r = annotation.rect
  const pad = 2 // 2-point padding for shape tools to avoid clipping

  // Convert normalised rect to PDF coordinates
  const topLeft = toPdfPoint(r.x, r.y, pageWidth, pageHeight)
  const bottomRight = toPdfPoint(
    r.x + r.width,
    r.y + r.height,
    pageWidth,
    pageHeight,
  )

  const x = topLeft.x
  const y = bottomRight.y // bottom-left Y = page bottom of rect
  const w = bottomRight.x - topLeft.x
  const h = topLeft.y - bottomRight.y

  const color = hexToRgb(annotation.color)
  const alpha = annotation.opacity

  switch (annotation.type) {
    case 'highlight': {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: color,
        opacity: alpha * 0.35,
        borderWidth: 0,
      })
      break
    }

    case 'underline': {
      page.drawLine({
        start: { x, y: y + pad },
        end: { x: x + w, y: y + pad },
        thickness: 2,
        color,
        opacity: alpha,
      })
      break
    }

    case 'strikethrough': {
      page.drawLine({
        start: { x, y: y + h / 2 },
        end: { x: x + w, y: y + h / 2 },
        thickness: 2,
        color,
        opacity: alpha,
      })
      break
    }

    case 'rectangle': {
      // Fill with low opacity
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color,
        opacity: alpha * 0.15,
        borderWidth: 0,
      })
      // Stroke border
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: undefined,
        borderColor: color,
        borderWidth: 1.5,
        opacity: alpha,
      })
      break
    }

    case 'ellipse': {
      // pdf-lib doesn't have a direct ellipse draw, so we approximate
      // with a series of lines. For simplicity, draw a rectangle with
      // rounded corners that approximates the ellipse visually.
      const rx = w / 2
      const ry = h / 2
      const cx = x + rx
      const cy = y + ry

      // Draw filled ellipse approximation
      const steps = 24
      const fillPath = Array.from({ length: steps + 1 }, (_, i) => {
        const angle = (i / steps) * Math.PI * 2
        return `${i === 0 ? 'M' : 'L'} ${cx + rx * Math.cos(angle)} ${cy + ry * Math.sin(angle)}`
      }).join(' ')

      page.drawSvgPath(`${fillPath} Z`, {
        color,
        opacity: alpha * 0.15,
      })

      // Draw stroke ellipse
      page.drawSvgPath(`${fillPath} Z`, {
        borderColor: color,
        borderWidth: 1.5,
        opacity: alpha,
        color: undefined,
      })
      break
    }

    case 'draw': {
      if (!annotation.points || annotation.points.length < 2) break

      // Convert normalised draw points to PDF coordinates
      const pdfPoints = annotation.points.map((p) => toPdfPoint(p.x, p.y, pageWidth, pageHeight))

      // Build a line path through all points
      const path = pdfPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ')

      page.drawSvgPath(path, {
        borderColor: color,
        borderWidth: 1.5,
        opacity: alpha,
        color: undefined,
      })
      break
    }

    case 'note': {
      // Draw a small sticky-note icon
      const iconSize = Math.max(w, h, 16)
      page.drawRectangle({
        x,
        y,
        width: iconSize,
        height: iconSize,
        color,
        opacity: alpha,
        borderWidth: 0,
      })
      // Draw "i" indicator (approximate with two rectangles for simplicity)
      const textSize = 8
      page.drawRectangle({
        x: x + iconSize / 2 - 1,
        y: y + iconSize * 0.65,
        width: 2,
        height: 6,
        color: rgb(1, 1, 1),
      })
      page.drawRectangle({
        x: x + iconSize / 2 - 1.5,
        y: y + iconSize * 0.2,
        width: 3,
        height: 3,
        color: rgb(1, 1, 1),
      })
      break
    }

    case 'text': {
      // Text box annotation — draw the text at the specified position
      const text = annotation.text || ''
      if (!text) break

      const fontSize = annotation.fontSize || 12

      try {
        page.drawText(text, {
          x: x + 2,
          y: y + 2,
          size: fontSize,
          color,
          opacity: alpha,
          maxWidth: Math.max(w - 4, 50),
        })
      } catch {
        // Font embedding may fail for some text; skip silently
      }
      break
    }
  }
}

/**
 * Burn a set of annotations into a PDF buffer.
 *
 * @param pdfBytes - The original PDF as a Uint8Array
 * @param annotations - Array of annotations to burn in
 * @returns A new PDF buffer with annotations drawn directly on the pages
 */
export async function burnAnnotationsIntoPdf(
  pdfBytes: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const pages = doc.getPages()

  // Group annotations by page index
  const annotationsByPage = new Map<number, PdfAnnotation[]>()
  for (const ann of annotations) {
    const existing = annotationsByPage.get(ann.pageIndex) || []
    existing.push(ann)
    annotationsByPage.set(ann.pageIndex, existing)
  }

  // Draw each page's annotations
  for (const [pageIndex, pageAnnotations] of annotationsByPage) {
    if (pageIndex >= pages.length) continue

    const page = pages[pageIndex]
    const { width: pageWidth, height: pageHeight } = page.getSize()

    for (const annotation of pageAnnotations) {
      drawAnnotation(page, annotation, pageWidth, pageHeight)
    }
  }

  return doc.save()
}
