'use client'

// DocumentScanner — photograph a document on mobile (or pick an image on desktop),
// drag the four page corners to deskew, apply a "scanned" look, collect multiple
// pages, then export the result as a JPEG (single page) or an A4 PDF. The produced
// File is handed to the caller, which feeds it into the existing /api/documents
// upload form — this component never uploads or computes anything domain-specific
// itself; all image math lives in src/lib/scanner/.

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Camera, X, Loader2, RotateCcw, Plus, Trash2, Check, FileImage, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  warpPerspective, applyScanFilter, canvasToJpegBlob,
  type Corner, type ScanMode,
} from '@/lib/scanner/image-processing'
import { buildPdfFromJpegBlobs } from '@/lib/scanner/pdf-build'

interface ScannedPage {
  id: string
  blob: Blob
  url: string
}

interface DocumentScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the finished document (JPEG or PDF) for the caller to upload. */
  onComplete: (file: File) => void
}

const DEFAULT_CORNERS: [Corner, Corner, Corner, Corner] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
]

const MODE_LABELS: Record<ScanMode, string> = {
  bw: 'B & W',
  gray: 'Grayscale',
  color: 'Colour',
}

export function DocumentScanner({ open, onOpenChange, onComplete }: DocumentScannerProps) {
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [captureUrl, setCaptureUrl] = useState<string | null>(null)
  const [corners, setCorners] = useState<[Corner, Corner, Corner, Corner]>(DEFAULT_CORNERS)
  const [mode, setMode] = useState<ScanMode>('bw')
  const [busy, setBusy] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const imgElRef = useRef<HTMLImageElement | null>(null)
  const captureImgRef = useRef<HTMLImageElement | null>(null) // loaded source for warp
  const activeCornerRef = useRef<number | null>(null)

  const resetAll = useCallback(() => {
    setPages((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return [] })
    setCaptureUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    captureImgRef.current = null
    setCorners(DEFAULT_CORNERS)
    setMode('bw')
    setBusy(false)
  }, [])

  // Clean up object URLs if the component unmounts mid-scan.
  useEffect(() => () => {
    if (captureUrl) URL.revokeObjectURL(captureUrl)
    pages.forEach((p) => URL.revokeObjectURL(p.url))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    resetAll()
    onOpenChange(false)
  }

  function handleCameraFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      captureImgRef.current = img
      setCorners(DEFAULT_CORNERS)
      setCaptureUrl(url)
    }
    img.onerror = () => { URL.revokeObjectURL(url); toast.error('Could not load that image') }
    img.src = url
  }

  // ── Corner dragging (normalized 0..1 coords over the displayed image) ──────────
  function pointerToNormalized(clientX: number, clientY: number): Corner {
    const el = imgElRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  }

  function onHandleDown(idx: number, e: React.PointerEvent) {
    e.preventDefault()
    activeCornerRef.current = idx
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function onHandleMove(e: React.PointerEvent) {
    if (activeCornerRef.current == null) return
    const idx = activeCornerRef.current
    const p = pointerToNormalized(e.clientX, e.clientY)
    setCorners((prev) => {
      const next = [...prev] as [Corner, Corner, Corner, Corner]
      next[idx] = p
      return next
    })
  }
  function onHandleUp(e: React.PointerEvent) {
    activeCornerRef.current = null
    try { (e.target as Element).releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  // ── Apply crop → produce a processed page ──────────────────────────────────────
  async function addPage() {
    const img = captureImgRef.current
    if (!img) return
    setBusy(true)
    try {
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = img.naturalWidth
      srcCanvas.height = img.naturalHeight
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0)

      const pxCorners = corners.map((c) => ({
        x: c.x * img.naturalWidth,
        y: c.y * img.naturalHeight,
      })) as [Corner, Corner, Corner, Corner]

      const warped = warpPerspective(srcCanvas, pxCorners)
      applyScanFilter(warped, mode)
      const blob = await canvasToJpegBlob(warped)

      const url = URL.createObjectURL(blob)
      setPages((prev) => [...prev, { id: crypto.randomUUID(), blob, url }])
      setCaptureUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
      captureImgRef.current = null
    } catch {
      toast.error('Could not process that page')
    } finally {
      setBusy(false)
    }
  }

  function retake() {
    setCaptureUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    captureImgRef.current = null
    cameraInputRef.current?.click()
  }

  function removePage(id: string) {
    setPages((prev) => {
      const p = prev.find((x) => x.id === id)
      if (p) URL.revokeObjectURL(p.url)
      return prev.filter((x) => x.id !== id)
    })
  }

  // ── Export ─────────────────────────────────────────────────────────────────────
  function finishAsImage() {
    if (pages.length !== 1) return
    const file = new File([pages[0].blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
    onComplete(file)
    close()
  }

  async function finishAsPdf() {
    if (pages.length === 0) return
    setBusy(true)
    try {
      const pdfBlob = await buildPdfFromJpegBlobs(pages.map((p) => p.blob))
      const file = new File([pdfBlob], `scan-${Date.now()}.pdf`, { type: 'application/pdf' })
      onComplete(file)
      close()
    } catch {
      toast.error('Could not build the PDF')
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-base font-semibold">Scan document</h2>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close scanner">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraFile}
      />

      {captureUrl ? (
        /* ── Crop / deskew step ───────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/40">
            <div className="relative inline-block max-w-full touch-none select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgElRef}
                src={captureUrl}
                alt="Captured page"
                className="block max-w-full max-h-[60vh] object-contain"
                draggable={false}
              />
              {/* Quad outline + handles */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
                <polygon
                  points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
                  fill="rgba(59,130,246,0.12)"
                  stroke="rgb(59,130,246)"
                  strokeWidth={0.5}
                />
              </svg>
              {corners.map((c, idx) => (
                <div
                  key={idx}
                  onPointerDown={(e) => onHandleDown(idx, e)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  className="absolute h-7 w-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-blue-500 bg-blue-500/30 touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                />
              ))}
            </div>
          </div>

          {/* Filter selector */}
          <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-border shrink-0">
            {(['bw', 'gray', 'color'] as ScanMode[]).map((m) => (
              <Button
                key={m}
                variant={mode === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m]}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border shrink-0">
            <Button variant="outline" onClick={retake} disabled={busy}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Retake
            </Button>
            <Button onClick={addPage} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Add page
            </Button>
          </div>
        </div>
      ) : (
        /* ── Page list / capture step ─────────────────────────────────────────── */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {pages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <Camera className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-xs">
                  Photograph a document with your camera, then drag the corners to straighten it.
                </p>
                <Button onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1.5" /> Take photo
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pages.map((p, i) => (
                  <div key={p.id} className="relative rounded-lg border border-border overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Page ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                    <span className="absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {i + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white"
                      onClick={() => removePage(p.id)}
                      aria-label={`Remove page ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-lg border-2 border-dashed border-border aspect-[3/4] flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-muted-foreground/60 transition-colors"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-xs">Add page</span>
                </button>
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
              <Button
                variant="outline"
                onClick={finishAsImage}
                disabled={busy || pages.length !== 1}
                title={pages.length !== 1 ? 'Image export is for a single page' : undefined}
              >
                <FileImage className="h-4 w-4 mr-1.5" /> Save as image
              </Button>
              <Button onClick={finishAsPdf} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                Save as PDF
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
