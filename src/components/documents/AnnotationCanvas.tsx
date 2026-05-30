'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { PdfAnnotation, AnnotationTool } from '@/types/pdf-annotations'

interface AnnotationCanvasProps {
  width: number
  height: number
  annotations: PdfAnnotation[]
  tool: AnnotationTool
  color: string
  opacity: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAnnotate: (annotation: Omit<PdfAnnotation, 'id' | 'createdAt' | 'createdBy'>) => void
  /** The current page index being rendered */
  pageIndex: number
}

export function AnnotationCanvas({
  width,
  height,
  annotations,
  tool,
  color,
  opacity,
  selectedId,
  onSelect,
  onAnnotate,
  pageIndex,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const drawPoints = useRef<{ x: number; y: number }[]>([])

  // Get normalised coordinates relative to canvas
  const normalise = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / width,
      y: (e.clientY - rect.top) / height,
    }
  }, [width, height])

  // Redraw all annotations when they change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    for (const ann of annotations) {
      if (ann.pageIndex !== pageIndex) continue

      ctx.save()
      ctx.globalAlpha = ann.opacity
      ctx.strokeStyle = ann.color
      ctx.fillStyle = ann.color
      ctx.lineWidth = selectedId === ann.id ? 3 : 2

      const r = ann.rect
      const x = r.x * width
      const y = r.y * height
      const w = r.width * width
      const h = r.height * height

      switch (ann.type) {
        case 'highlight':
          ctx.globalAlpha = 0.3
          ctx.fillRect(x, y, w, h)
          break

        case 'underline':
          ctx.beginPath()
          ctx.moveTo(x, y + h)
          ctx.lineTo(x + w, y + h)
          ctx.stroke()
          break

        case 'strikethrough':
          ctx.beginPath()
          ctx.moveTo(x, y + h / 2)
          ctx.lineTo(x + w, y + h / 2)
          ctx.stroke()
          break

        case 'rectangle':
          ctx.globalAlpha = 0.15
          ctx.fillRect(x, y, w, h)
          ctx.globalAlpha = ann.opacity
          ctx.strokeRect(x, y, w, h)
          break

        case 'ellipse': {
          ctx.globalAlpha = 0.15
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = ann.opacity
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
          ctx.stroke()
          break
        }

        case 'draw':
          if (ann.points && ann.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(ann.points[0].x * width, ann.points[0].y * height)
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x * width, ann.points[i].y * height)
            }
            ctx.stroke()
          }
          break

        case 'note': {
          // Draw a small note icon
          const size = 20
          ctx.fillStyle = ann.color
          ctx.globalAlpha = ann.opacity
          // Rounded rectangle for note icon
          ctx.beginPath()
          ctx.roundRect(x, y, size, size, 3)
          ctx.fill()
          // "i" indicator
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 12px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('i', x + size / 2, y + size / 2)
          break
        }
      }

      ctx.restore()
    }
  }, [annotations, width, height, pageIndex, selectedId])

  // Handle mouse events for drawing new annotations
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') {
      // Check if clicking on existing annotation
      const pos = normalise(e)
      const clicked = annotations.find(a => {
        if (a.pageIndex !== pageIndex) return false
        const r = a.rect
        return (
          pos.x >= r.x && pos.x <= r.x + r.width &&
          pos.y >= r.y && pos.y <= r.y + r.height
        )
      })
      onSelect(clicked?.id ?? null)
      return
    }

    isDrawing.current = true
    const pos = normalise(e)
    startPoint.current = pos
    drawPoints.current = [pos]

    if (tool === 'draw') {
      // For freeform draw, start immediately
    }
  }, [tool, normalise, annotations, pageIndex, onSelect])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return

    const pos = normalise(e)

    if (tool === 'draw') {
      drawPoints.current.push(pos)
      // Draw live on the canvas
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const pts = drawPoints.current
      ctx.strokeStyle = color
      ctx.globalAlpha = opacity
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pts[0].x * width, pts[0].y * height)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * width, pts[i].y * height)
      }
      ctx.stroke()
    } else {
      // For shape tools, clear and draw preview
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx || !startPoint.current) return

      // Redraw all annotations (to clear the preview)
      ctx.clearRect(0, 0, width, height)
      // ... annotations would be redrawn by the effect, but we need to force it
      // For simplicity, we just commit on mouseUp for shape tools
    }
  }, [tool, normalise, color, opacity, width, height])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return
    isDrawing.current = false

    if (!startPoint.current) return

    const start = startPoint.current
    const end = drawPoints.current[drawPoints.current.length - 1] || start

    let rect = { x: start.x, y: start.y, width: 0, height: 0 }
    let points: { x: number; y: number }[] | undefined

    switch (tool) {
      case 'highlight':
      case 'underline':
      case 'strikethrough':
      case 'rectangle':
      case 'ellipse':
        rect = {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        }
        break
      case 'draw':
        if (drawPoints.current.length > 1) {
          points = [...drawPoints.current]
          // Compute bounding rect from points
          const xs = drawPoints.current.map(p => p.x)
          const ys = drawPoints.current.map(p => p.y)
          rect = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          }
        }
        break
      case 'note': {
        const noteSize = 0.03 // 3% of page size
        rect = {
          x: start.x - noteSize / 2,
          y: start.y - noteSize / 2,
          width: noteSize,
          height: noteSize,
        }
        break
      }
      case 'pan':
        return
    }

    // Ignore very small annotations (accidental clicks)
    if (rect.width < 0.005 && rect.height < 0.005 && tool !== 'note') return

    onAnnotate({
      type: tool as PdfAnnotation['type'],
      pageIndex,
      color,
      opacity,
      rect,
      points,
      text: tool === 'note' ? 'Note' : undefined,
    })

    startPoint.current = null
    drawPoints.current = []
  }, [tool, color, opacity, pageIndex, onAnnotate])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`absolute inset-0 ${
        tool === 'pan' ? 'cursor-default' : 'cursor-crosshair'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}
