'use client'

import { useEffect, useState, useRef } from 'react'
import { Paperclip, Upload, X, Loader2, Eye, Trash2, FileText, Image } from 'lucide-react'
import {
  useTripAttachments,
  type TripAttachmentRecord,
} from '@/hooks/trips/useTripAttachments'

interface TripAttachmentsSectionProps {
  tripId: string
  dayId?: string // if provided, operates on day-level; otherwise trip-level
  label?: string // e.g. "Trip Documents" or "Day Attachments"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function AttachmentRow({
  attachment,
  onPreview,
  onDelete,
  getFileUrl,
  isPreview,
}: {
  attachment: TripAttachmentRecord
  onPreview: () => void
  onDelete: () => void
  getFileUrl: (id: string) => string
  isPreview: boolean
}) {
  const fileUrl = getFileUrl(attachment.id)

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 group text-sm">
        {isImage(attachment.mimeType) ? (
          <Image className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="truncate block">{attachment.title}</span>
          <span className="text-xs text-muted-foreground">
            {attachment.fileName} &middot; {formatSize(attachment.fileSize)}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button
            type="button"
            onClick={onPreview}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Preview"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline preview for images */}
      {isPreview && isImage(attachment.mimeType) && (
        <div className="px-3 pb-2">
          <img
            src={fileUrl}
            alt={attachment.title}
            className="max-h-48 rounded border border-border object-contain"
          />
        </div>
      )}
    </>
  )
}

export function TripAttachmentsSection({
  tripId,
  dayId,
  label = 'Attachments',
}: TripAttachmentsSectionProps) {
  const {
    attachments,
    loading,
    uploading,
    previewId,
    fileRef,
    fetchAttachments,
    upload,
    remove,
    togglePreview,
    getFileUrl,
  } = useTripAttachments(tripId)

  const [expanded, setExpanded] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Fetch attachments when expanded
  useEffect(() => {
    if (expanded) {
      fetchAttachments(dayId)
    }
  }, [expanded, dayId, fetchAttachments])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      upload(file, file.name.replace(/\.[^/.]+$/, ''), dayId)
      e.target.value = ''
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      upload(file, file.name.replace(/\.[^/.]+$/, ''), dayId)
    }
  }

  return (
    <div className="border-t border-border">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full p-3 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          {label}
          {attachments.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-xs">
              {attachments.length}
            </span>
          )}
        </span>
        <span className="text-muted-foreground/60 text-xs">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Upload zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded border border-dashed p-3 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading
                ? 'Uploading...'
                : 'Click to browse or drag & drop a file'}
            </button>
          </div>

          {/* Attachments list */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No attachments yet
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-md">
              {attachments.map((a) => (
                <AttachmentRow
                  key={a.id}
                  attachment={a}
                  onPreview={() => togglePreview(a.id)}
                  onDelete={() => remove(a.id, dayId)}
                  getFileUrl={(id) => getFileUrl(id, dayId)}
                  isPreview={previewId === a.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
