'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SecureUnlockDialog } from '@/components/shared/SecureUnlockDialog'
import { DocumentTextEditor } from './DocumentTextEditor'
import {
  X,
  Download,
  Loader2,
  AlertCircle,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentData } from './DocumentCard'

interface DocumentViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: DocumentData
}

type ViewerMode = 'loading' | 'pdf' | 'docx' | 'xlsx' | 'text' | 'image' | 'unsupported' | 'error'

export function DocumentViewer({ open, onOpenChange, document }: DocumentViewerProps) {
  const [mode, setMode] = useState<ViewerMode>('loading')
  const [content, setContent] = useState<string>('')
  const [textContent, setTextContent] = useState<string>('')
  const [textExt, setTextExt] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [fullscreen, setFullscreen] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)

  const mimeType = document.mimeType || ''
  const ext = document.fileName.split('.').pop()?.toLowerCase() || ''
  const viewUrl = `/api/documents/${document.id}/view`

  const loadContent = useCallback(async () => {
    setMode('loading')
    setError('')

    // Determine viewer mode from mime type and extension
    const isPdf = mimeType === 'application/pdf' || ext === 'pdf'
    const isWord = mimeType.includes('word') || mimeType.includes('officedocument') || ext === 'docx'
    const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('excel') || ext === 'xlsx' || ext === 'xls'
    const isText = mimeType.startsWith('text/') || ext === 'txt' || ext === 'md' || ext === 'csv'
    const isImage = mimeType.startsWith('image/')

    if (isPdf) {
      setMode('pdf')
      return
    }

    if (isImage) {
      setMode('image')
      return
    }

    if (isWord || isExcel || isText) {
      try {
        const res = await fetch(`/api/documents/${document.id}/content`)
        if (!res.ok) {
          if (res.status === 403) {
            // PIN protected — show unlock dialog
            setShowUnlockDialog(true)
            setMode('loading')
            return
          }
          throw new Error('Failed to load content')
        }
        const data = await res.json()

        if (isWord) {
          setContent(data.html || '')
          setMode('docx')
        } else if (isExcel) {
          setContent(data.html || '')
          setMode('xlsx')
        } else if (isText) {
          setTextContent(data.text || '')
          setTextExt(data.ext || ext)
          setMode('text')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document content')
        setMode('error')
      }
      return
    }

    // Fallback: unsupported
    setMode('unsupported')
  }, [document.id, document.mimeType, document.fileName, ext, mimeType])

  useEffect(() => {
    if (open) {
      loadContent()
    }
  }, [open, loadContent])

  // Lock the document when viewer closes
  useEffect(() => {
    return () => {
      if (isUnlocked) {
        fetch(`/api/documents/${document.id}/lock`, { method: 'POST' }).catch(() => {})
      }
    }
  }, [document.id, isUnlocked])

  async function handleDownload() {
    try {
      const res = await fetch(`/api/documents/${document.id}/download`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document.title + '.' + document.fileName.split('.').pop()
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download document')
    }
  }

  function handleUnlocked() {
    setIsUnlocked(true)
    setShowUnlockDialog(false)
    // Reload content now that we're unlocked
    loadContent()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => {
        if (!open) {
          setFullscreen(false)
          setMode('loading')
          setContent('')
          setTextContent('')
          setError('')
        }
        onOpenChange(open)
      }}>
        <DialogContent className={fullscreen
          ? 'max-w-[98vw] h-[96vh] sm:max-w-[98vw]'
          : 'max-w-4xl h-[85vh] sm:max-w-4xl'
        }>
          <DialogHeader className="flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <DialogTitle className="text-base truncate">{document.title}</DialogTitle>
              <span className="text-xs text-muted-foreground shrink-0">
                .{ext}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setFullscreen(!fullscreen)}
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {fullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleDownload}
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpenChange(false)}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden rounded-md border border-border bg-background">
            {mode === 'loading' && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Loading document...</p>
              </div>
            )}

            {mode === 'pdf' && (
              <iframe
                src={viewUrl}
                className="w-full h-full"
                title={document.title}
              />
            )}

            {mode === 'image' && (
              <div className="flex items-center justify-center h-full p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewUrl}
                  alt={document.title}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            )}

            {mode === 'docx' && (
              <div className="h-full overflow-y-auto p-6">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              </div>
            )}

            {mode === 'xlsx' && (
              <div className="h-full overflow-y-auto p-6">
                <style>{`
                  .excel-workbook table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.8125rem;
                  }
                  .excel-workbook th,
                  .excel-workbook td {
                    border: 1px solid hsl(var(--border));
                    padding: 0.375rem 0.5rem;
                    text-align: left;
                  }
                  .excel-workbook th {
                    background: hsl(var(--muted));
                    font-weight: 600;
                  }
                  .excel-workbook tr:nth-child(even) td {
                    background: hsl(var(--muted) / 0.5);
                  }
                `}</style>
                <div dangerouslySetInnerHTML={{ __html: content }} />
              </div>
            )}

            {mode === 'text' && (
              <DocumentTextEditor
                content={textContent}
                ext={textExt}
                documentId={document.id}
                onContentSaved={(newContent) => setTextContent(newContent)}
              />
            )}

            {mode === 'unsupported' && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">Preview not available</p>
                <p className="text-xs mt-1 mb-4">
                  This file type cannot be previewed in the browser.
                </p>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download to view
                </Button>
              </div>
            )}

            {mode === 'error' && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 text-destructive opacity-70" />
                <p className="text-sm font-medium">Failed to load document</p>
                <p className="text-xs mt-1 mb-4">{error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={loadContent}>
                    Try again
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlock Dialog */}
      {document.isSecured && (
        <SecureUnlockDialog
          open={showUnlockDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowUnlockDialog(false)
              onOpenChange(false)
            }
          }}
          entityType="document"
          entityId={document.id}
          entityName={document.title}
          onUnlocked={handleUnlocked}
        />
      )}
    </>
  )
}
