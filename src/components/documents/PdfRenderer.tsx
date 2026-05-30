'use client'

import { useRef, useEffect, useState } from 'react'
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
}

export function PdfRenderer({
  url,
  zoom,
  page,
  onPageRender,
  onPagesLoaded,
  onPageChange,
}: PdfRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null)

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

        onPageRender?.(page - 1, viewport.width, viewport.height)

        // pdfjs-dist v5 uses canvas element directly, not canvasContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderTask = (pdfPage as any).render({
          canvas,
          viewport,
        })

        renderTaskRef.current = renderTask
        await renderTask.promise

        if (!cancelled) {
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfRenderer] Page render failed:', err)
        }
      }
    }

    setLoading(true)
    renderPage()

    return () => {
      cancelled = true
      // Cancel any in-flight render
      if (renderTaskRef.current?.cancel) {
        renderTaskRef.current.cancel()
      }
    }
  }, [page, zoom, onPageRender])

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
        </div>
      </div>
    </div>
  )
}
