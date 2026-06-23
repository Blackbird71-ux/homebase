// src/types/pdf-annotations.ts
// Types for PDF annotation data stored as sidecar JSON files.

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'note'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'signature'

export interface AnnotationRect {
  x: number       // Normalised (0-1) left position relative to page width
  y: number       // Normalised (0-1) top position relative to page height
  width: number   // Normalised (0-1) width
  height: number  // Normalised (0-1) height
}

export interface PdfAnnotation {
  id: string
  type: AnnotationType
  pageIndex: number    // 0-based page index
  color: string        // Hex colour e.g. "#FFEB3B"
  opacity: number      // 0-1
  rect: AnnotationRect // Bounding box (normalised 0-1 coordinates)
  /** Optional freeform drawing points (normalised 0-1) */
  points?: { x: number; y: number }[]
  /** Optional text content (sticky notes, text boxes, comments) */
  text?: string
  /** Font size for text annotations (default: 12) */
  fontSize?: number
  /** Font family for text annotations (default: Helvetica) */
  fontFamily?: string
  /** PNG data URL for signature annotations (drawn on a pad, embedded on burn) */
  imageData?: string
  createdAt: string    // ISO 8601
  createdBy: string    // User display name
}

export interface PdfAnnotationSet {
  documentId: string
  version: number
  annotations: PdfAnnotation[]
  updatedAt: string    // ISO 8601
}

/** Tools available in the annotation toolbar */
export type AnnotationTool = 'pan' | 'highlight' | 'underline' | 'strikethrough' | 'note' | 'draw' | 'rectangle' | 'ellipse' | 'text' | 'signature'

export interface AnnotationViewerState {
  tool: AnnotationTool
  color: string
  opacity: number
  zoom: number
  currentPage: number
  totalPages: number
  isDrawing: boolean
  selectedAnnotationId: string | null
}
