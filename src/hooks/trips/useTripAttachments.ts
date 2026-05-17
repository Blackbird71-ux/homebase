'use client'

import { useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface TripAttachmentRecord {
  id: string
  tripId: string
  dayId: string | null
  title: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedById: string
  createdAt: string
}

/**
 * Manages attachment state and API calls for trip-level and day-level attachments.
 *
 * @param tripId  The trip ID
 */
export function useTripAttachments(tripId: string) {
  const [attachments, setAttachments] = useState<TripAttachmentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAttachments = useCallback(
    async (dayId?: string) => {
      setLoading(true)
      try {
        const endpoint = dayId
          ? `/api/trips/${tripId}/days/${dayId}/attachments`
          : `/api/trips/${tripId}/attachments`
        const res = await fetch(endpoint)
        if (res.ok) {
          setAttachments(await res.json())
        } else {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error ?? 'Failed to load attachments')
        }
      } finally {
        setLoading(false)
      }
    },
    [tripId],
  )

  const upload = useCallback(
    async (file: File, title: string, dayId?: string) => {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', title)
        const endpoint = dayId
          ? `/api/trips/${tripId}/days/${dayId}/attachments`
          : `/api/trips/${tripId}/attachments`
        const res = await fetch(endpoint, { method: 'POST', body: fd })
        if (res.ok) {
          const a = await res.json()
          setAttachments((prev) => [...prev, a])
          toast.success('Attachment uploaded')
        } else {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error ?? 'Failed to upload attachment')
        }
      } finally {
        setUploading(false)
      }
    },
    [tripId],
  )

  const remove = useCallback(
    async (attachmentId: string, dayId?: string) => {
      if (!confirm('Remove this attachment?')) return
      const endpoint = dayId
        ? `/api/trips/${tripId}/days/${dayId}/attachments/${attachmentId}`
        : `/api/trips/${tripId}/attachments/${attachmentId}`
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
        toast.success('Attachment removed')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to remove attachment')
      }
    },
    [tripId],
  )

  const togglePreview = useCallback((attId: string) => {
    setPreviewId((prev) => (prev === attId ? null : attId))
  }, [])

  const getFileUrl = useCallback(
    (attachmentId: string, dayId?: string) => {
      return dayId
        ? `/api/trips/${tripId}/days/${dayId}/attachments/${attachmentId}`
        : `/api/trips/${tripId}/attachments/${attachmentId}`
    },
    [tripId],
  )

  return {
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
  }
}
