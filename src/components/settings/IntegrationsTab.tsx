'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface IntegrationsTabProps {
  isAdmin: boolean
  initialUmamiScriptUrl: string | null
  initialUmamiSiteId: string | null
}

type Status = { type: 'success' | 'error'; message: string } | null

interface ImportResult {
  success: boolean
  eventCount?: number
  message?: string
  error?: string
}

export function IntegrationsTab({ isAdmin, initialUmamiScriptUrl, initialUmamiSiteId }: IntegrationsTabProps) {
  // Cozi import
  const [icsFile, setIcsFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Umami config
  const [umamiScriptUrl, setUmamiScriptUrl] = useState(initialUmamiScriptUrl ?? '')
  const [umamiSiteId, setUmamiSiteId] = useState(initialUmamiSiteId ?? '')
  const [umamiSaving, setUmamiSaving] = useState(false)
  const [umamiStatus, setUmamiStatus] = useState<Status>(null)

  async function handleCoziImport() {
    if (!icsFile) return
    setImportLoading(true)
    setImportResult(null)

    const form = new FormData()
    form.append('ics', icsFile)

    const res = await fetch('/api/import/cozi', { method: 'POST', body: form })
    const data = await res.json()
    setImportLoading(false)

    if (!res.ok) {
      setImportResult({ success: false, error: data.error ?? 'Import failed' })
    } else {
      setImportResult({ success: true, eventCount: data.eventCount, message: data.message })
    }
  }

  async function saveUmami() {
    setUmamiSaving(true)
    setUmamiStatus(null)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          umamiScriptUrl: umamiScriptUrl.trim(),
          umamiSiteId: umamiSiteId.trim(),
        }),
      })
      if (res.ok) {
        setUmamiStatus({ type: 'success', message: 'Umami settings saved. Analytics will load on next page visit.' })
      } else {
        const data = await res.json()
        setUmamiStatus({ type: 'error', message: data.error ?? 'Failed to save.' })
      }
    } catch {
      setUmamiStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setUmamiSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cozi Import */}
      <Card>
        <CardHeader>
          <CardTitle>Import from Cozi</CardTitle>
          <CardDescription>
            Export your Cozi calendar as an .ics file and upload it here to import your events.
            Lists must be re-entered manually. This can be run again if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => document.getElementById('ics-input')?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Choose .ics file
            </Button>
            <input
              id="ics-input"
              type="file"
              accept=".ics"
              className="hidden"
              onChange={e => setIcsFile(e.target.files?.[0] ?? null)}
            />
            {icsFile && <span className="text-sm text-muted-foreground">{icsFile.name}</span>}
          </div>

          <Button type="button" onClick={handleCoziImport} disabled={!icsFile || importLoading}>
            {importLoading ? 'Importing...' : 'Import Events'}
          </Button>

          {importResult && (
            <div role="alert" className={`flex items-start gap-2 text-sm p-3 rounded-md ${importResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {importResult.success
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{importResult.success ? importResult.message : importResult.error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            How to export from Cozi: Open Cozi → Settings → Export calendar → Download .ics file.
          </p>
        </CardContent>
      </Card>

      {/* Umami Analytics — admin only */}
      <Card>
        <CardHeader>
          <CardTitle>Umami Analytics</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Admin only — configure your self-hosted Umami tracking script. Applies to all family members.'
              : 'Only admins can configure analytics. Contact your family admin.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="umami-script-url">Script URL</Label>
                <Input
                  id="umami-script-url"
                  type="url"
                  value={umamiScriptUrl}
                  onChange={e => setUmamiScriptUrl(e.target.value)}
                  placeholder="https://your-umami-instance.com/script.js"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="umami-site-id">Website ID</Label>
                <Input
                  id="umami-site-id"
                  value={umamiSiteId}
                  onChange={e => setUmamiSiteId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={saveUmami} disabled={umamiSaving}>
                  {umamiSaving ? 'Saving...' : 'Save Analytics Config'}
                </Button>
                {(umamiScriptUrl || umamiSiteId) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setUmamiScriptUrl('')
                      setUmamiSiteId('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {umamiStatus && (
                <div role="alert" className={`flex items-start gap-2 text-sm p-3 rounded-md ${umamiStatus.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                  {umamiStatus.type === 'success'
                    ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span>{umamiStatus.message}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {initialUmamiScriptUrl
                ? 'Analytics is configured for this family.'
                : 'Analytics is not configured.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
