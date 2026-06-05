'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { PdfRenderer } from './PdfRenderer'
import { AnnotationCanvas } from './AnnotationCanvas'
import { AnnotationToolbar } from './AnnotationToolbar'
import type { PdfAnnotation, PdfAnnotationSet, AnnotationTool } from '@/types/pdf-annotations'
import { Download, FileOutput, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PdfAnnotationViewerProps {
  /** URL to fetch the PDF from */
  pdfUrl: string
  /** Document ID for loading/saving annotations */
  documentId: string
  /** Document title for naming exported files */
  documentTitle?: string
}

export function PdfAnnotationViewer({ pdfUrl, documentId, documentTitle }: PdfAnnotationViewerProps) {
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
  const [exporting, setExporting] = useState(false)

  // Text input state for the 'text' annotation tool
  const [textInput, setTextInput] = useState<{
    pos: { x: number; y: number }
    value: string
  } | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

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

  // Handle text tool click — show text input at the clicked position
  const handleTextClick = useCallback((pos: { x: number; y: number }) => {
    setTextInput({ pos, value: '' })
    // Focus the textarea after render
    setTimeout(() => {
      textInputRef.current?.focus()
    }, 0)
  }, [])

  // Commit the current text input as an annotation
  const handleCommitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null)
      return
    }

    // Estimate text box size based on content
    const lines = textInput.value.split('\n')
    const maxLineLen = Math.max(...lines.map(l => l.length))
    const charWidth = 0.006 // rough normalised width per character
    const lineHeight = 0.025 // rough normalised height per line
    const textWidth = Math.min(maxLineLen * charWidth, 0.5)
    const textHeight = Math.min(lines.length * lineHeight, 0.5)

    handleAnnotate({
      type: 'text',
      pageIndex: page - 1,
      color,
      opacity,
      rect: {
        x: textInput.pos.x,
        y: textInput.pos.y,
        width: textWidth,
        height: textHeight,
      },
      text: textInput.value,
      fontSize: 12,
    })

    setTextInput(null)
  }, [textInput, handleAnnotate, page, color, opacity])

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

  // Auto-save annotations before export, then call export endpoint
  const handleExport = useCallback(async (saveAsNew: boolean) => {
    setExporting(true)
    try {
      // Ensure annotations are saved first
      if (hasChanges) {
        const saveRes = await fetch(`/api/documents/${documentId}/annotations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations }),
        })
        if (!saveRes.ok) throw new Error('Failed to save annotations before export')
        setSavedAnnotations([...annotations])
      }

      const res = await fetch(`/api/documents/${documentId}/export-annotated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveAsNew }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(err.error ?? 'Failed to export annotated PDF')
      }

      if (saveAsNew) {
        toast.success(`Annotated PDF saved to Vault"`)
      } else {
        // Download the annotated PDF
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const safeName = (documentTitle || 'document').replace(/[^a-zA-Z0-9 _-]/g, '')
        const a = window.document.createElement('a')
        a.href = url
        a.download = `${safeName}-annotated.pdf`
        window.document.body.appendChild(a)
        a.click()
        window.document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Annotated PDF downloaded')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export annotated PDF')
    } finally {
      setExporting(false)
    }
  }, [documentId, documentTitle, annotations, hasChanges])

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
      // Escape deselect / cancel text input
      if (e.key === 'Escape') {
        if (textInput) {
          setTextInput(null)
          return
        }
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
      if (e.key === '7') setTool('text')
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleUndo, handleRedo, handleSave, hasChanges])

  return (
    <div className="flex flex-col gap-1 h-full">
      {/* Toolbar (includes tools, colors, opacity, zoom, undo/redo, save) */}
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
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </div>

      {/* Export bar — Download or Save annotated copy */}
      <div className="shrink-0 flex items-center justify-end gap-2">
        {exporting ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Exporting...
          </div>
        ) : annotations.length > 0 && (
          <>
            <Button
              variant="outline"
              size="xs"
              onClick={() => handleExport(false)}
              title="Download PDF with annotations burned in"
              className="gap-1 h-6 text-[10px]"
              disabled={exporting}
            >
              <Download className="h-3 w-3" />
              Download with annotations
            </Button>
            <Button
              size="xs"
              onClick={() => handleExport(true)}
              title="Save annotated copy to Document Vault"
              className="gap-1 h-6 text-[10px]"
              disabled={exporting}
            >
              <FileOutput className="h-3 w-3" />
              Save annotated copy
            </Button>
          </>
        )}
      </div>

      {/* PDF viewer + annotation canvas */}
      <div className="flex-1 relative overflow-hidden rounded-md border border-border bg-muted/20">
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
                onTextClick={handleTextClick}
              />

              {/* Text input overlay for the 'text' tool */}
              {textInput && (
                <textarea
                  ref={textInputRef}
                  value={textInput.value}
                  onChange={(e) => setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onBlur={handleCommitText}
                  onKeyDown={(e) => {
                    // Enter without Shift commits
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleCommitText()
                    }
                    // Escape cancels
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setTextInput(null)
                    }
                  }}
                  className="absolute z-20 min-w-[120px] min-h-[32px] p-1 text-xs rounded border border-primary/50 bg-background shadow-md resize focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{
                    left: `${textInput.pos.x * 100}%`,
                    top: `${textInput.pos.y * 100}%`,
                  }}
                  placeholder="Type text..."
                  rows={1}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
