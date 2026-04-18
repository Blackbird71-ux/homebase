'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UploadIcon, FileArchiveIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react'

interface BookResult {
  name: string
  imported: number
  skipped: number
  error?: string
}

interface ImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

type Status = 'idle' | 'importing' | 'done'

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<BookResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    setFiles(Array.from(selected).filter((f) => f.name.endsWith('.zip')))
    setResults([])
    setError(null)
    setStatus('idle')
  }

  async function handleImport() {
    if (!files.length) return
    setStatus('importing')
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await fetch('/api/recipes/import', { method: 'POST', body: fd })
      const data = await res.json() as { books?: BookResult[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
        setStatus('idle')
        return
      }
      setResults(data.books ?? [])
      setStatus('done')
      onImported?.()
    } catch {
      setError('Network error — please try again')
      setStatus('idle')
    }
  }

  function handleClose() {
    if (status === 'importing') return
    setFiles([])
    setResults([])
    setError(null)
    setStatus('idle')
    onOpenChange(false)
  }

  const totalImported = results.reduce((s, r) => s + r.imported, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Umami</DialogTitle>
        </DialogHeader>

        {status !== 'done' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Drop Umami zip files here, or click to select
              </p>
              <p className="text-xs text-muted-foreground">Multiple files supported</p>
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileArchiveIcon className="h-3.5 w-3.5 shrink-0" />
                    {f.name}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
              <CheckCircleIcon className="h-4 w-4" />
              {totalImported} recipe{totalImported !== 1 ? 's' : ''} imported
              {totalSkipped > 0 && `, ${totalSkipped} skipped`}
            </div>
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden text-sm">
              {results.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">{r.name}</span>
                  {r.error ? (
                    <span className="text-destructive text-xs">{r.error}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {r.imported} in · {r.skipped} skipped
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {status === 'done' ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={status === 'importing'}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!files.length || status === 'importing'}>
                {status === 'importing' ? 'Importing...' : `Import ${files.length > 0 ? files.length + ' file' + (files.length > 1 ? 's' : '') : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
