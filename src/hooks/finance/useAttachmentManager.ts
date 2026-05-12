'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'

export interface AttachmentRecord {
  id: string
  title: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
}

/**
 * Manages attachment state and API calls for a list of entities (bills or income entries).
 * Only one entity's attachment panel can be open at a time.
 *
 * @param basePath  e.g. '/api/finance/bills' or '/api/finance/income'
 */
export function useAttachmentManager(basePath: string) {
  const [openEntityId, setOpenEntityId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function open(entityId: string) {
    setOpenEntityId(entityId)
    setLoading(true)
    try {
      const res = await fetch(`${basePath}/${entityId}/attachments`)
      if (res.ok) {
        setAttachments(await res.json())
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to load attachments')
      }
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setOpenEntityId(null)
    setAttachments([])
    setPreviewId(null)
  }

  function togglePreview(attId: string) {
    setPreviewId(prev => (prev === attId ? null : attId))
  }

  async function upload(entityId: string, file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
      const res = await fetch(`${basePath}/${entityId}/attachments`, { method: 'POST', body: fd })
      if (res.ok) {
        const a = await res.json()
        setAttachments(prev => [...prev, a])
        toast.success('Attachment uploaded')
      } else {
        toast.error('Failed to upload attachment')
      }
    } finally {
      setUploading(false)
    }
  }

  async function remove(entityId: string, attachmentId: string) {
    if (!confirm('Remove this attachment?')) return
    const res = await fetch(`${basePath}/${entityId}/attachments/${attachmentId}`, { method: 'DELETE' })
    if (res.ok) {
      setAttachments(prev => prev.filter(a => a.id !== attachmentId))
      toast.success('Attachment removed')
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to remove attachment')
    }
  }

  return { openEntityId, attachments, loading, uploading, previewId, fileRef, open, close, togglePreview, upload, remove }
}
