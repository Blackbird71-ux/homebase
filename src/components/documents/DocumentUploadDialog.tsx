'use client'

import { useState, useRef } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileText, X, LockIcon, Camera } from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentData } from './DocumentCard'
import { DocumentScanner } from './DocumentScanner'

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

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: (doc: DocumentData) => void
}

export function DocumentUploadDialog({ open, onOpenChange, onUploaded }: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [notes, setNotes] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [remindBefore, setRemindBefore] = useState('30')
  const [emailReminder, setEmailReminder] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [pinCode, setPinCode] = useState('')
  const [uploading, setUploading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleScanned(scanned: File) {
    setFile(scanned)
    if (!title) setTitle(scanned.name.replace(/\.[^/.]+$/, ''))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      if (!title) {
        // Auto-fill title from filename (without extension)
        setTitle(selected.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      setFile(dropped)
      if (!title) {
        setTitle(dropped.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  async function handleUpload() {
    if (!file || !title) {
      toast.error('Please select a file and enter a title')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('category', category)
      formData.append('notes', notes || '')
      formData.append('expiryDate', expiryDate || '')
      formData.append('remindBefore', remindBefore)
      formData.append('emailReminder', emailReminder ? 'true' : 'false')
      if (hasPin && pinCode) {
        formData.append('pin', pinCode)
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? 'Upload failed')
      }

      const doc = await res.json()
      onUploaded(doc)
      resetForm()
      onOpenChange(false)
      toast.success('Document uploaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  function resetForm() {
    setFile(null)
    setTitle('')
    setCategory('other')
    setNotes('')
    setExpiryDate('')
    setRemindBefore('30')
    setEmailReminder(false)
    setHasPin(false)
    setPinCode('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Drawer open={open} onOpenChange={(open) => {
      if (!open) resetForm()
      onOpenChange(open)
    }}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Upload Document</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 py-4 flex-1 overflow-y-auto">
          {/* File Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              file ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop a file here or click to browse
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select File
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScannerOpen(true)}
                  >
                    <Camera className="h-4 w-4 mr-1.5" /> Scan with camera
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Home Insurance Policy"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Category</Label>
              <Select value={category} onValueChange={(v) => { if (v !== null) setCategory(v) }}>
              <SelectTrigger id="doc-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Notes (optional)</Label>
            <Input
              id="doc-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Policy number, provider, etc."
            />
          </div>

          {/* Expiry Date & Reminder */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-expiry">Expiry Date (optional)</Label>
              <Input
                id="doc-expiry"
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-remind">Remind Before (days)</Label>
              <Input
                id="doc-remind"
                type="number"
                min={1}
                max={365}
                value={remindBefore}
                onChange={e => setRemindBefore(e.target.value)}
              />
            </div>
          </div>

          {/* Email Reminder */}
          {expiryDate && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Reminder</Label>
                <p className="text-xs text-muted-foreground">
                  Email all family members {remindBefore} day{remindBefore === '1' ? '' : 's'} before expiry
                </p>
              </div>
              <input
                type="checkbox"
                checked={emailReminder}
                onChange={e => setEmailReminder(e.target.checked)}
                className="w-4 h-4 rounded"
              />
            </div>
          )}

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
                  setHasPin(!hasPin)
                  if (hasPin) setPinCode('')
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                  hasPin ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                aria-checked={hasPin}
                role="switch"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  hasPin ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {hasPin && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="doc-pin">Set a 4-6 digit PIN</Label>
                <Input
                  id="doc-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter PIN"
                />
                <p className="text-xs text-muted-foreground">
                  A PIN must be entered to view or download this document.
                </p>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2 sm:justify-end">
          <Button onClick={handleUpload} disabled={uploading || !file || !title}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DrawerFooter>
      </DrawerContent>

      <DocumentScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onComplete={handleScanned}
      />
    </Drawer>
  )
}
