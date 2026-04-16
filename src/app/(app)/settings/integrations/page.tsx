'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface ImportResult {
  success: boolean
  eventCount?: number
  message?: string
  error?: string
}

export default function IntegrationsPage() {
  const [icsFile, setIcsFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleImport() {
    if (!icsFile) return
    setLoading(true)
    setResult(null)

    const form = new FormData()
    form.append('ics', icsFile)

    const res = await fetch('/api/import/cozi', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setResult({ success: false, error: data.error ?? 'Import failed' })
    } else {
      setResult({ success: true, eventCount: data.eventCount, message: data.message })
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">Manage external integrations and data imports.</p>
      </div>

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
            <label className="flex items-center gap-2 cursor-pointer">
              <Button variant="outline" onClick={() => document.getElementById('ics-input')?.click()}>
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
            </label>
            {icsFile && <span className="text-sm text-muted-foreground">{icsFile.name}</span>}
          </div>

          <Button onClick={handleImport} disabled={!icsFile || loading}>
            {loading ? 'Importing...' : 'Import Events'}
          </Button>

          {result && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${result.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
              {result.success
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{result.success ? result.message : result.error}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            How to export from Cozi: Open Cozi → Settings → Export calendar → Download .ics file.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Umami Analytics</CardTitle>
          <CardDescription>Coming in Phase 3 — configure your Umami tracking script.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not yet configured.</p>
        </CardContent>
      </Card>
    </div>
  )
}
