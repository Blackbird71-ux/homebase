'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RotateCcw, History, Loader2, AlertTriangle, Download, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { formatInTz, todayStringInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'

interface AuditEntry {
  id: string
  familyId: string
  userId: string
  userName: string
  action: string
  entity: string
  entityId: string
  summary: string
  details: string | null
  createdAt: string
}

const ENTITY_LABELS: Record<string, string> = {
  event: 'Events',
  list: 'Lists',
  listItem: 'List Items',
  recipe: 'Recipes',
  chore: 'Chores',
  contact: 'Contacts',
  note: 'Notes',
  document: 'Documents',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  undo: 'Undone',
}

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-500',
  update: 'text-blue-500',
  delete: 'text-red-500',
  undo: 'text-purple-500',
}

export function ActivityLogTab() {
  const tz = useFamilyTimezone()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [entityFilter, setEntityFilter] = useState('all')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      })
      if (entityFilter !== 'all') params.set('entity', entityFilter)

      const res = await fetch(`/api/audit-log?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setEntries(data.entries)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }, [entityFilter, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  async function handleUndo(entryId: string) {
    setUndoing(entryId)
    try {
      const res = await fetch(`/api/audit-log/${entryId}`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to undo')
      } else {
        toast.success(data.message)
        fetchLogs()
      }
    } catch {
      toast.error('Failed to undo action')
    } finally {
      setUndoing(null)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  // Backup & Truncate state
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  async function handleBackupAndTruncate() {
    setBackingUp(true)
    try {
      const res = await fetch('/api/audit-log/backup', { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to backup audit log')
        return
      }

      if (data.count === 0) {
        toast.info('No entries older than 3 months to backup.')
        setBackupDialogOpen(false)
        return
      }

      // Trigger download of the backup JSON
      const blob = new Blob([JSON.stringify(data.entries, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-backup-${todayStringInTz(tz)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Backed up and removed ${data.count} log entries.`)
      setBackupDialogOpen(false)
      fetchLogs()
    } catch {
      toast.error('Failed to backup audit log')
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Activity Log</h3>
          <p className="text-sm text-muted-foreground">
            Track changes made across the app. You can undo recent actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
            <DialogTrigger>
              <Button variant="outline" size="sm">
                <Archive className="h-4 w-4 mr-1.5" />
                Backup & Truncate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Backup & Truncate Activity Log</DialogTitle>
                <DialogDescription>
                  This will archive all log entries older than 3 months and remove them from the database.
                  The backup will be downloaded as a JSON file. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="py-3 text-sm text-muted-foreground">
                <p>This operation will:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Find all log entries older than 3 months</li>
                  <li>Download them as a JSON backup file</li>
                  <li>Permanently delete them from the database</li>
                </ul>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBackupDialogOpen(false)}
                  disabled={backingUp}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBackupAndTruncate}
                  disabled={backingUp}
                >
                  {backingUp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Backup & Remove
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Select value={entityFilter} onValueChange={(v) => {
            if (v !== null) {
              setEntityFilter(v)
              setPage(0)
            }
          }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <History className="h-10 w-10 mb-2 opacity-50" />
          <p>No activity recorded yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <Card key={entry.id} size="sm">
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium uppercase ${ACTION_COLORS[entry.action] ?? ''}`}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ENTITY_LABELS[entry.entity] ?? entry.entity}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{entry.userName}</span>
                      </div>
                      <p className="text-sm mt-0.5">{entry.summary}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatInTz(new Date(entry.createdAt), tz, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    {entry.action !== 'undo' && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleUndo(entry.id)}
                        disabled={undoing === entry.id}
                      >
                        {undoing === entry.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        <span className="ml-1">Undo</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
