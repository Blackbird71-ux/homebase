'use client'

import { useEffect, useState, useRef } from 'react'
import { Paperclip, Upload, X, Loader2, Eye, Trash2, FileText, Image, ChevronDown } from 'lucide-react'
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

function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf'
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
            {formatSize(attachment.fileSize)}
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

      {/* Inline preview */}
      {isPreview && (
        <div className="px-3 pb-2">
          {isImage(attachment.mimeType) ? (
            <img
              src={fileUrl}
              alt={attachment.title}
              className="max-h-48 rounded border border-border object-contain"
            />
          ) : isPdf(attachment.mimeType) ? (
            <iframe
              src={fileUrl}
              title={attachment.title}
              className="w-full h-96 rounded border border-border"
            />
          ) : (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              Open in new tab
            </a>
          )}
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
    <div>
      {/* Toggle pill */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 999,
          border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)',
          background: expanded
            ? 'color-mix(in srgb, var(--primary) 18%, transparent)'
            : 'color-mix(in srgb, var(--primary) 10%, transparent)',
          color: 'var(--primary)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <Paperclip size={12} />
        {label || 'Attachments'}
        {attachments.length > 0 && (
          <span style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            borderRadius: 999,
            padding: '1px 6px',
            fontSize: 11,
            fontWeight: 600,
          }}>
            {attachments.length}
          </span>
        )}
        <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {expanded && (
        <div style={{ marginTop: 8, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)' }} className="space-y-2">
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
