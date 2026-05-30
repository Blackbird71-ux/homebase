'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { PdfRenderer } from './PdfRenderer'
import { AnnotationCanvas } from './AnnotationCanvas'
import { AnnotationToolbar } from './AnnotationToolbar'
import type { PdfAnnotation, PdfAnnotationSet, AnnotationTool } from '@/types/pdf-annotations'
import { toast } from 'sonner'

interface PdfAnnotationViewerProps {
  /** URL to fetch the PDF from */
  pdfUrl: string
  /** Document ID for loading/saving annotations */
  documentId: string
}

export function PdfAnnotationViewer({ pdfUrl, documentId }: PdfAnnotationViewerProps) {
  // PDF state
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  // Annotation state
  const [tool, setTool] = useState<AnnotationTool>('pan')
  const [color, setColor] = useState('#FFEB3B')
  const [opacity, setOpacity] = useState(0.7)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [savedAnnotations, setSavedAnnotations] = useState<PdfAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Undo history
  const [history, setHistory] = useState<PdfAnnotation[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const hasChanges = JSON.stringify(annotations) !== JSON.stringify(savedAnnotations)

  // Load annotations from server
  useEffect(() => {
    let cancelled = false

    async function loadAnnotations() {
      try {
        const res = await fetch(`/api/documents/${documentId}/annotations`)
        if (res.ok) {
          const data: PdfAnnotationSet = await res.json()
          if (!cancelled) {
            setAnnotations(data.annotations)
            setSavedAnnotations(data.annotations)
            setHistory([data.annotations])
            setHistoryIndex(0)
          }
        }
        // If 404, no annotations exist yet — that's fine
      } catch (err) {
        console.error('[PdfAnnotationViewer] Failed to load annotations:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAnnotations()
    return () => { cancelled = true }
  }, [documentId])

  // Handle page render from PdfRenderer
  const handlePageRender = useCallback((_pageIndex: number, width: number, height: number) => {
    setPageDims({ width, height })
  }, [])

  // Handle new annotation from canvas
  const handleAnnotate = useCallback((partial: Omit<PdfAnnotation, 'id' | 'createdAt' | 'createdBy'>) => {
    const annotation: PdfAnnotation = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: '', // Will be set server-side
    }

    const newAnnotations = [...annotations, annotation]
    setAnnotations(newAnnotations)

    // Add to history (truncate any redo items)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newAnnotations)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [annotations, history, historyIndex])

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setAnnotations(history[historyIndex - 1])
    }
  }, [history, historyIndex])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setAnnotations(history[historyIndex + 1])
    }
  }, [history, historyIndex])

  // Save annotations
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annotations,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(err.error ?? 'Failed to save annotations')
      }

      setSavedAnnotations([...annotations])
      toast.success('Annotations saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save annotations')
    } finally {
      setSaving(false)
    }
  }, [documentId, annotations])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ctrl+Z undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Ctrl+Shift+Z redo
      if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
      // Ctrl+S save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (hasChanges) handleSave()
      }
      // Escape deselect
      if (e.key === 'Escape') {
        setSelectedId(null)
        setTool('pan')
      }
      // Number keys for tools
      if (e.key === '1') setTool('pan')
      if (e.key === '2') setTool('highlight')
      if (e.key === '3') setTool('underline')
      if (e.key === '4') setTool('strikethrough')
      if (e.key === '5') setTool('note')
      if (e.key === '6') setTool('draw')
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleUndo, handleRedo, handleSave, hasChanges])

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Toolbar */}
      <div className="shrink-0">
        <AnnotationToolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          opacity={opacity}
          onOpacityChange={setOpacity}
          onSave={handleSave}
          saving={saving}
          hasChanges={hasChanges}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
        />
      </div>

      {/* Zoom controls */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
            className="p-1 hover:bg-accent rounded text-xs text-muted-foreground"
          >
            -
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="p-1 hover:bg-accent rounded text-xs text-muted-foreground"
          >
            +
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Click & drag to annotate · {selectedId ? 'Annotation selected' : `${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* PDF viewer + annotation canvas */}
      <div className="flex-1 relative overflow-hidden rounded-md border border-border bg-muted/20">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading document...
          </div>
        )}

        <PdfRenderer
          url={pdfUrl}
          zoom={zoom}
          page={page}
          onPageRender={handlePageRender}
          onPagesLoaded={setTotalPages}
          onPageChange={setPage}
        />

        {/* Annotation canvas overlay — only when page dimensions are known */}
        {pageDims.width > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              // Position the overlay to match the rendered canvas
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingTop: totalPages > 1 ? '28px' : '0', // Account for page nav
            }}
          >
            <div
              className="relative pointer-events-auto"
              style={{
                width: pageDims.width,
                height: pageDims.height,
                maxWidth: '100%',
              }}
            >
              <AnnotationCanvas
                width={pageDims.width}
                height={pageDims.height}
                annotations={annotations}
                tool={tool}
                color={color}
                opacity={opacity}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAnnotate={handleAnnotate}
                pageIndex={page - 1}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
