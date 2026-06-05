'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Download, Database, RotateCcw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { formatInTz } from '@/lib/timezone'

interface CoziImport {
  id: string
  importedAt: string
  eventCount: number
  notes: string | null
}

interface DataTabProps {
  coziImports: CoziImport[]
  userEmail: string
}

function DatabaseBackupsSection() {
  const timezone = useFamilyTimezone()
  const [backups, setBackups] = useState<{ filename: string; size: number; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  async function loadBackups() {
    setLoading(true)
    try {
      const res = await fetch('/api/backups')
      if (res.ok) {
        const data = await res.json()
        setBackups(data.backups ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBackups() }, [])

  async function createBackup() {
    setCreating(true)
    try {
      const res = await fetch('/api/backups/create', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      toast.success('Backup created successfully')
      loadBackups()
    } catch {
      toast.error('Failed to create backup')
    } finally {
      setCreating(false)
    }
  }

  async function restoreBackup(filename: string) {
    if (!confirm(`Restore backup "${filename}"? This will replace the current database. The app will restart.`)) return
    setRestoring(filename)
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Database restored. The app will restart shortly.')
      setTimeout(() => window.location.reload(), 3000)
    } catch {
      toast.error('Failed to restore backup')
    } finally {
      setRestoring(null)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Database Backups
        </CardTitle>
        <CardDescription>
          Automated daily backups are stored on the NAS volume. You can also create manual backups and restore from previous backups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Daily backup runs at 3:00 AM (container time). Last 30 backups are retained.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadBackups} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={createBackup} disabled={creating}>
              <Database className="h-3.5 w-3.5 mr-1" />
              {creating ? 'Creating...' : 'Backup Now'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading backups...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups found. The first automated backup will run tonight at 3:00 AM.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border max-h-60 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.filename} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{backup.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatInTz(new Date(backup.createdAt), timezone, {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })} &middot; {formatSize(backup.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0 ml-2"
                  onClick={() => restoreBackup(backup.filename)}
                  disabled={restoring === backup.filename}
                >
                  <RotateCcw className={`h-3 w-3 mr-1 ${restoring === backup.filename ? 'animate-spin' : ''}`} />
                  {restoring === backup.filename ? 'Restoring...' : 'Restore'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DataTab({ coziImports, userEmail }: DataTabProps) {
  const router = useRouter()
  const timezone = useFamilyTimezone()
  const [exporting, setExporting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/export', { method: 'POST' })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `homebase-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== userEmail) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/settings', { method: 'DELETE' })
      if (res.ok) {
        router.push('/login')
      } else {
        const data = await res.json()
        setDeleteError(data.error ?? 'Failed to delete account.')
      }
    } catch {
      setDeleteError('Network error.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export Family Data</CardTitle>
          <CardDescription>
            Download all your family data as a JSON file, including events, lists, recipes, and meal plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={handleExport} disabled={exporting} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Preparing export...' : 'Download JSON Export'}
          </Button>
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Cozi Import History</CardTitle>
          <CardDescription>Record of all Cozi calendar imports for this family.</CardDescription>
        </CardHeader>
        <CardContent>
          {coziImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="border border-border rounded-md divide-y divide-border">
              {coziImports.map(imp => (
                <div key={imp.id} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {formatInTz(new Date(imp.importedAt), timezone, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">{imp.eventCount} events</span>
                  </div>
                  {imp.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{imp.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database Backups */}
      <DatabaseBackupsSection />

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are permanent and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!deleteOpen ? (
            <div className="border border-destructive/20 rounded-lg p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium">Delete Your Account</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Permanently removes your account. If you are the only admin, this will be blocked — promote another member first.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowConfirmDialog(true)}
              >
                Delete My Account
              </Button>
            </div>
          ) : (
            <div className="border border-destructive/20 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-destructive">Confirm Account Deletion</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently delete your account and remove you from the family. This cannot be undone.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirm">Type your email address to confirm:</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={userEmail}
                />
              </div>
              {deleteError && (
                <p role="alert" className="text-sm text-destructive">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(null) }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteConfirm !== userEmail || deleteLoading}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Are you sure?
            </DialogTitle>
            <DialogDescription>
              You are about to delete your account. This action will:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Permanently remove your account from the family</li>
                <li>Delete all your personal data</li>
                <li>Remove your access to Homebase</li>
                <li>Cannot be undone</li>
              </ul>
              <p className="mt-3 font-medium">
                If you are the only admin, you must promote another member first.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowConfirmDialog(false)
                setDeleteOpen(true)
              }}
            >
              Continue to Confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
