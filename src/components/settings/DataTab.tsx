'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Download } from 'lucide-react'

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

export function DataTab({ coziImports, userEmail }: DataTabProps) {
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
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
      // silently fail — user sees no download
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
                      {new Date(imp.importedAt).toLocaleDateString('en-AU', {
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
                onClick={() => setDeleteOpen(true)}
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
    </div>
  )
}
