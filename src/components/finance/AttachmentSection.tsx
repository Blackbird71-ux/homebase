'use client'

import { Download, Eye, EyeOff, FileText, Paperclip, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttachmentRecord } from '@/hooks/finance/useAttachmentManager'

function isImageMime(mime: string) { return mime.startsWith('image/') }
function isPdfMime(mime: string)   { return mime === 'application/pdf' }
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AttachmentSectionProps {
  attachments: AttachmentRecord[]
  loading: boolean
  uploading: boolean
  previewId: string | null
  fileRef: React.RefObject<HTMLInputElement | null>
  getAttachmentUrl: (attId: string) => string
  onClose: () => void
  onTogglePreview: (attId: string) => void
  onUpload: (file: File) => void | Promise<void>
  onDelete: (attId: string) => void | Promise<void>
  firstUploadLabel?: string
  emptyMessage?: string
}

export function AttachmentSection({
  attachments, loading, uploading, previewId, fileRef,
  getAttachmentUrl, onClose, onTogglePreview, onUpload, onDelete,
  firstUploadLabel = 'Upload Invoice',
  emptyMessage = 'No attachments yet.',
}: AttachmentSectionProps) {
  return (
    <div className="rounded-b-lg border border-t-0 border-green-500/30 bg-green-500/5 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-3.5 w-3.5 text-green-600" /> Attachments
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading&hellip;</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => {
            const attUrl = getAttachmentUrl(att.id)
            const isPreviewing = previewId === att.id
            const canPreview = isImageMime(att.mimeType) || isPdfMime(att.mimeType)
            return (
              <div key={att.id}>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate font-medium">{att.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.fileSize)}</span>
                  {canPreview && (
                    <button onClick={() => onTogglePreview(att.id)}
                      className={cn('p-1 rounded hover:bg-accent', isPreviewing ? 'text-primary' : 'text-muted-foreground')}>
                      {isPreviewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <a href={attUrl} target="_blank" rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-accent text-primary">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => onDelete(att.id)}
                    className="p-1 rounded hover:bg-accent text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isPreviewing && (
                  <div className="mt-1 rounded-md border border-border bg-background overflow-hidden">
                    {isImageMime(att.mimeType)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={attUrl} alt={att.title} className="max-h-[500px] w-full object-contain p-2" />
                      : <iframe src={attUrl} title={att.title} className="w-full border-0" style={{ height: '600px' }} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {attachments.length < 2 && (
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (file) await onUpload(file)
              e.target.value = ''
            }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : attachments.length === 0 ? firstUploadLabel : 'Upload Reference Doc'}
          </button>
          <p className="text-xs text-muted-foreground">PDF, JPG, PNG, DOC &middot; Max 2 files</p>
        </div>
      )}
    </div>
  )
}
