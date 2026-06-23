'use client'

// SignaturePad — a small modal canvas the user draws their signature on (mouse or
// touch). On apply it returns a trimmed PNG data URL plus the drawing's aspect
// ratio (height/width) so the caller can place it on a PDF page at the right
// proportions. The actual embedding into the PDF happens server-side in the
// existing burn-annotations pipeline.

import { useRef, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eraser } from 'lucide-react'

interface SignaturePadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with a PNG data URL and aspect ratio (height / width) of the signature. */
  onApply: (dataUrl: string, aspect: number) => void
}

const CANVAS_W = 500
const CANVAS_H = 200

export function SignaturePad({ open, onOpenChange, onApply }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)
  // Track the inked bounding box so we can trim whitespace on export.
  const bounds = useRef({ minX: CANVAS_W, minY: CANVAS_H, maxX: 0, maxY: 0 })

  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }, [])

  function recordBounds(x: number, y: number) {
    const b = bounds.current
    b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y)
    b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y)
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    drawing.current = true
    const p = pointFromEvent(e)
    last.current = p
    recordBounds(p.x, p.y)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pointFromEvent(e)
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current!.x, last.current!.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    recordBounds(p.x, p.y)
    if (!hasInk) setHasInk(true)
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false
    last.current = null
    try { (e.target as Element).releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function clear() {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    bounds.current = { minX: CANVAS_W, minY: CANVAS_H, maxX: 0, maxY: 0 }
    setHasInk(false)
  }

  function apply() {
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    const b = bounds.current
    const pad = 8
    const sx = Math.max(0, b.minX - pad)
    const sy = Math.max(0, b.minY - pad)
    const sw = Math.min(CANVAS_W, b.maxX + pad) - sx
    const sh = Math.min(CANVAS_H, b.maxY + pad) - sy
    if (sw <= 0 || sh <= 0) return

    // Crop to the inked bounds so the placed signature has no surrounding margin.
    const out = document.createElement('canvas')
    out.width = Math.round(sw)
    out.height = Math.round(sh)
    out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
    const dataUrl = out.toDataURL('image/png')
    onApply(dataUrl, out.height / out.width)
    clear()
    onOpenChange(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) clear()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
        </DialogHeader>
        <div className="px-1">
          <div className="rounded-lg border border-border bg-white">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full touch-none rounded-lg"
              style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sign with your mouse or finger. You&apos;ll place it on the page next.
          </p>
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={clear} disabled={!hasInk}>
            <Eraser className="h-4 w-4 mr-1.5" /> Clear
          </Button>
          <Button onClick={apply} disabled={!hasInk}>
            Use signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
