'use client'

import { useState, useEffect, useCallback } from 'react'
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Download, Trash2, Edit3, AlertTriangle, Calendar, ShieldCheckIcon, LockIcon, UnlockIcon, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { SecureUnlockDialog } from '@/components/shared/SecureUnlockDialog'
import { DocumentViewer } from './DocumentViewer'

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
  isSecured?: boolean
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
  const [editHasPin, setEditHasPin] = useState(!!(document as DocumentData & { pinHash?: string | null }).pinHash)
  const [editPinCode, setEditPinCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false)

  // Unlock state
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [showUnlockDialog, setShowUnlockDialog] = useState(false)

  // Lock the document by calling the lock API and updating local state
  const handleLock = useCallback(async () => {
    try {
      await fetch(`/api/documents/${document.id}/lock`, { method: 'POST' })
    } catch {
      // Silently fail
    }
    setIsUnlocked(false)
  }, [document.id])

  // Lock the document when the component unmounts (user navigates away)
  useEffect(() => {
    return () => {
      if (isUnlocked) {
        fetch(`/api/documents/${document.id}/lock`, { method: 'POST' }).catch(() => {})
      }
    }
  }, [document.id, isUnlocked])

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
      const body: Record<string, unknown> = {
        title: editTitle,
        category: editCategory,
        notes: editNotes || null,
        expiryDate: editExpiryDate || null,
        remindBefore: parseInt(editRemindBefore, 10) || 30,
      }
      if (editHasPin) {
        if (editPinCode) {
          body.pin = editPinCode
        }
      }
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      <Card size="sm" className="relative cursor-pointer" onDoubleClick={() => document.isSecured && !isUnlocked ? setShowUnlockDialog(true) : setEditOpen(true)}>
        {document.isSecured && (
          <div className="absolute top-2 left-2 flex items-center gap-1 text-xs text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/40 px-2 py-0.5 rounded-full z-10">
            <ShieldCheckIcon className="h-3 w-3" />
            Secure
          </div>
        )}
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
            {document.isSecured && !isUnlocked ? (
              <Button variant="ghost" size="xs" onClick={() => setShowUnlockDialog(true)}>
                <LockIcon className="h-3 w-3 mr-1" />
                Unlock to Download
              </Button>
            ) : (
              <Button variant="ghost" size="xs" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            )}
            {document.isSecured && isUnlocked && (
              <Button variant="ghost" size="xs" onClick={handleLock}>
                <LockIcon className="h-3 w-3 mr-1" />
                Lock
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => setViewerOpen(true)}>
              <Eye className="h-3 w-3 mr-1" />
              View
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

      {/* Edit Drawer */}
      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Edit Document</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
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

            {/* PIN Protection */}
            <div className="p-3 border border-input rounded-md bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">PIN Protection</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditHasPin(!editHasPin)
                    if (editHasPin) setEditPinCode('')
                  }}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                    editHasPin ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                  aria-checked={editHasPin}
                  role="switch"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    editHasPin ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {editHasPin && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="edit-doc-pin">
                    {document.isSecured ? 'Enter new PIN (leave blank to keep current)' : 'Set a 4-6 digit PIN'}
                  </Label>
                  <Input
                    id="edit-doc-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={editPinCode}
                    onChange={(e) => setEditPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter PIN"
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    A PIN must be entered to view this document's content.
                  </p>
                </div>
              )}
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !editTitle}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Unlock Dialog */}
      {document.isSecured && (
        <SecureUnlockDialog
          open={showUnlockDialog}
          onOpenChange={(open) => {
            if (!open) setShowUnlockDialog(false)
          }}
          entityType="document"
          entityId={document.id}
          entityName={document.title}
          onUnlocked={() => {
            setIsUnlocked(true)
            setShowUnlockDialog(false)
          }}
        />
      )}

      {/* Document Viewer */}
      <DocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={document}
      />

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

