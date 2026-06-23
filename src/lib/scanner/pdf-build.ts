// src/lib/scanner/pdf-build.ts
// Client-safe helper: assemble scanned page JPEGs into a multi-page A4 PDF in the
// browser using pdf-lib (already a dependency; isomorphic). Each page image is
// scaled to fit within A4 margins, preserving aspect ratio and centred. Returns a
// PDF Blob ready to hand to the existing /api/documents upload path.

import { PDFDocument } from 'pdf-lib'

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 24

/** Build an A4 PDF from an ordered list of JPEG blobs (one page each). */
export async function buildPdfFromJpegBlobs(blobs: Blob[]): Promise<Blob> {
  const pdf = await PDFDocument.create()
  const maxW = A4_W - MARGIN * 2
  const maxH = A4_H - MARGIN * 2

  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const img = await pdf.embedJpg(bytes)
    const page = pdf.addPage([A4_W, A4_H])

    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    page.drawImage(img, {
      x: (A4_W - w) / 2,
      y: (A4_H - h) / 2,
      width: w,
      height: h,
    })
  }

  const out = await pdf.save()
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the Blob type is unambiguous.
  return new Blob([new Uint8Array(out)], { type: 'application/pdf' })
}
