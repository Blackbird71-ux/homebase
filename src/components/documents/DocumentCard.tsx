'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Download, Trash2, Edit3, AlertTriangle, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export interface DocumentData {
  id: string
  title: string
  category: string
  fileName: string
  fileSize: number
  mimeType: string
  notes: string | null
  expiryDate: string | null
  remindBefore: number
  uploadedById: string
  createdAt: string
  updatedAt: string
  uploadedBy: {
    id: string
    name: string
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  insurance: 'Insurance',
  warranty: 'Warranty',
  passport: 'Passport',
  id: 'ID Document',
  medical: 'Medical',
  financial: 'Financial',
  legal: 'Legal',
  tax: 'Tax',
  education: 'Education',
  vehicle: 'Vehicle',
  property: 'Property',
  other: 'Other',
}

const CATEGORY_COLORS: Record<string, string> = {
  insurance: 'text-blue-500 bg-blue-500/10',
  warranty: 'text-amber-500 bg-amber-500/10',
  passport: 'text-purple-500 bg-purple-500/10',
  id: 'text-indigo-500 bg-indigo-500/10',
  medical: 'text-red-500 bg-red-500/10',
  financial: 'text-green-500 bg-green-500/10',
  legal: 'text-slate-500 bg-slate-500/10',
  tax: 'text-orange-500 bg-orange-500/10',
  education: 'text-cyan-500 bg-cyan-500/10',
  vehicle: 'text-yellow-500 bg-yellow-500/10',
  property: 'text-pink-500 bg-pink-500/10',
  other: 'text-muted-foreground bg-muted',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDaysUntilExpiry(expiryDate: string): number {
  const now = new Date()
  const expiry = new Date(expiryDate)
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

interface DocumentCardProps {
  document: DocumentData
  onDeleted: (id: string) => void
  onUpdated: (doc: DocumentData) => void
}

export function DocumentCard({ document, onDeleted, onUpdated }: DocumentCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(document.title)
  const [editCategory, setEditCategory] = useState(document.category)
  const [editNotes, setEditNotes] = useState(document.notes ?? '')
  const [editExpiryDate, setEditExpiryDate] = useState(
    document.expiryDate ? document.expiryDate.slice(0, 10) : ''
  )
  const [editRemindBefore, setEditRemindBefore] = useState(String(document.remindBefore))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const daysUntilExpiry = document.expiryDate ? getDaysUntilExpiry(document.expiryDate) : null
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= document.remindBefore && daysUntilExpiry > 0
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0

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

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          notes: editNotes || null,
          expiryDate: editExpiryDate || null,
          remindBefore: parseInt(editRemindBefore, 10) || 30,
        }),
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = await res.json()
      onUpdated(updated)
      setEditOpen(false)
      toast.success('Document updated')
    } catch {
      toast.error('Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      onDeleted(document.id)
      setDeleteOpen(false)
      toast.success('Document deleted')
    } catch {
      toast.error('Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card size="sm" className="relative">
        {isExpired && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
            <AlertTriangle className="h-3 w-3" />
            Expired
          </div>
        )}
        {isExpiringSoon && !isExpired && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
            <Calendar className="h-3 w-3" />
            {daysUntilExpiry} days
          </div>
        )}
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[document.category] ?? CATEGORY_COLORS.other}`}>
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm truncate">{document.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {CATEGORY_LABELS[document.category] ?? document.category}
                {' · '}
                {formatFileSize(document.fileSize)}
                {' · '}
                Uploaded by {document.uploadedBy.name}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {document.notes && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{document.notes}</p>
          )}
          {document.expiryDate && (
            <p className={`text-xs flex items-center gap-1 ${
              isExpired ? 'text-destructive' : isExpiringSoon ? 'text-amber-500' : 'text-muted-foreground'
            }`}>
              <Calendar className="h-3 w-3" />
              Expires: {format(new Date(document.expiryDate), 'd MMM yyyy')}
              {daysUntilExpiry !== null && !isExpired && ` (${daysUntilExpiry} days)`}
            </p>
          )}
          <div className="flex items-center gap-1 mt-3">
            <Button variant="ghost" size="xs" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setEditOpen(true)}>
              <Edit3 className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Update document details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={editCategory} onValueChange={(v) => { if (v !== null) setEditCategory(v) }}>
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input id="edit-notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-expiry">Expiry Date</Label>
                <Input id="edit-expiry" type="date" value={editExpiryDate} onChange={e => setEditExpiryDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-remind">Remind Before (days)</Label>
                <Input id="edit-remind" type="number" min={1} max={365} value={editRemindBefore} onChange={e => setEditRemindBefore(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleSave} disabled={saving || !editTitle}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Delete Document
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{document.title}"? This will permanently remove the document and its file. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
