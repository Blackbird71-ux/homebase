'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

interface PdfRendererProps {
  /** URL to fetch the PDF from (e.g. /api/documents/{id}/view) */
  url: string
  /** Current zoom level (1 = 100%) */
  zoom: number
  /** Current page (1-based) */
  page: number
  /** Called when a page renders — gives back the page dimensions for overlay sizing */
  onPageRender?: (pageIndex: number, width: number, height: number) => void
  /** Called when total page count is known */
  onPagesLoaded?: (total: number) => void
  /** Called when user requests page change */
  onPageChange?: (page: number) => void
  /** Whether to show a selectable text layer over the rendered canvas */
  showTextLayer?: boolean
}

export function PdfRenderer({
  url,
  zoom,
  page,
  onPageRender,
  onPagesLoaded,
  onPageChange,
  showTextLayer = true,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null)
  const viewportRef = useRef<{ width: number; height: number; scale: number } | null>(null)

  // Load PDF document
  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      setLoading(true)
      setError(null)

      try {
        const pdfjsLib = await import('pdfjs-dist')

        // Set worker path
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const pdf = await pdfjsLib.getDocument(url).promise
        if (cancelled) return

        pdfDocRef.current = pdf
        setTotalPages(pdf.numPages)
        onPagesLoaded?.(pdf.numPages)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF')
        }
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [url, onPagesLoaded])

  // Build text layer from page text content
  const buildTextLayer = useCallback(async (pdfPage: PDFPageProxy, viewport: { width: number; height: number; scale: number }) => {
    const textLayerDiv = textLayerRef.current
    if (!textLayerDiv || !showTextLayer) return

    try {
      const textContent = await pdfPage.getTextContent()
      textLayerDiv.innerHTML = ''

      const pageHeight = viewport.height

      for (const item of textContent.items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = item as any
        const str = tx.str as string
        if (!str || !str.trim()) continue

        // Transform: [a, b, c, d, tx, ty] — we use tx, ty for position
        // In PDF coordinate space, y=0 is bottom. We need to flip Y.
        const tf = tx.transform as number[]
        const x = tf[4] * viewport.scale
        const y = pageHeight - tf[5] * viewport.scale - (tx.height || tx.fontSize || 10) * viewport.scale

        const fontSize = (tx.fontSize || 10) * viewport.scale
        const width = tx.width * viewport.scale

        const span = document.createElement('span')
        span.textContent = str
        span.style.position = 'absolute'
        span.style.left = `${x}px`
        span.style.top = `${y}px`
        span.style.fontSize = `${fontSize}px`
        span.style.lineHeight = `${fontSize}px`
        span.style.whiteSpace = 'pre'
        span.style.color = 'transparent'
        span.style.pointerEvents = 'auto'
        span.style.cursor = 'text'
        span.style.fontFamily = 'sans-serif'
        span.style.transform = 'none'
        span.style.width = `${width}px`
        span.style.minWidth = `${width}px`

        textLayerDiv.appendChild(span)
      }
    } catch {
      // Text layer is optional — fail silently
    }
  }, [showTextLayer])

  // Render current page
  useEffect(() => {
    let cancelled = false

    async function renderPage() {
      const pdf = pdfDocRef.current
      if (!pdf) return

      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      try {
        const pdfPage = await pdf.getPage(page)
        if (cancelled) return

        const viewport = (pdfPage as PDFPageProxy).getViewport({ scale: zoom })
        canvas.width = viewport.width
        canvas.height = viewport.height
        viewportRef.current = { width: viewport.width, height: viewport.height, scale: viewport.scale }

        onPageRender?.(page - 1, viewport.width, viewport.height)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderTask = (pdfPage as any).render({
          canvas,
          viewport,
        })

        renderTaskRef.current = renderTask
        await renderTask.promise

        if (!cancelled) {
          setLoading(false)
          // Build text layer after canvas renders
          await buildTextLayer(pdfPage as unknown as PDFPageProxy, viewport as unknown as { width: number; height: number; scale: number })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfRenderer] Page render failed:', err)
          setLoading(false)
          setError(err instanceof Error ? err.message : 'Failed to render PDF page')
        }
      }
    }

    setLoading(true)
    // Clear text layer on page change
    if (textLayerRef.current) {
      textLayerRef.current.innerHTML = ''
    }
    renderPage()

    return () => {
      cancelled = true
      if (renderTaskRef.current?.cancel) {
        renderTaskRef.current.cancel()
      }
    }
  }, [page, zoom, onPageRender, buildTextLayer])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 h-full">
      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-1 hover:bg-accent rounded disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-1 hover:bg-accent rounded disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Canvas container */}
      <div className="flex-1 overflow-auto flex items-start justify-center w-full">
        <div className="relative inline-block">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="shadow-md rounded-sm"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
          {/* Selectable text layer overlay */}
          {showTextLayer && (
            <div
              ref={textLayerRef}
              className="absolute inset-0 select-text"
              style={{
                color: 'transparent',
                pointerEvents: 'none',
                // Match the canvas positioning
              }}
              aria-label="PDF text layer for selection and copying"
            />
          )}
        </div>
      </div>
    </div>
  )
}
