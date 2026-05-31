'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, CheckCircle, AlertCircle, BookOpen, ExternalLink } from 'lucide-react'
import { GoogleCalendarCard } from './GoogleCalendarCard'
import { TunnelCard } from './TunnelCard'
import { toast } from 'sonner'

interface IntegrationsTabProps {
  isAdmin: boolean
  initialUmamiScriptUrl: string | null
  initialUmamiSiteId: string | null
  googleConnected: boolean
  googleEmail: string | null
}

type Status = { type: 'success' | 'error'; message: string } | null

interface ImportResult {
  success: boolean
  eventCount?: number
  message?: string
  error?: string
}

const textareaClass =
  'flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs'

// ── Cozi Recipe Bookmarklet (v2) ─────────────────────────────────────────────
// Extracts recipe data from Cozi's web app and copies JSON to clipboard.
// v2: rewritten for Cozi's actual DOM structure (diagnosed 2026-05-25)
// v3: scope searches to the recipe detail container, accept any tag for ingredients
// Cozi uses MUI (Material-UI) with SPA routing. Recipe pages have:
//   <h2>Recipe Name</h2>           (in a <div>, separate from content section)
//   <h3>Ingredients</h3>
//   <p>ingredient 1</p>            (each ingredient in <p>, not <li>)
//   <p>ingredient 2</p>
//   ...
//   <h3>Directions</h3>
//   <div>Step 1. Step 2. ...</div> (all steps in one <div>, split by period)
//   No JSON-LD, no servings info, URL stays at /recipes (SPA).
const BOOKMARKLET_HREF = [
  'javascript:(function(){',
  'var d=document,r={},ingH3=null,dirH3=null;',
  // Find the LAST "Ingredients" and "Directions" H3 (most recently rendered panel)
  'd.querySelectorAll(\"h3\").forEach(function(h3){',
  'var t=h3.innerText.trim().toLowerCase();',
  'if(t===\"ingredients\"){ingH3=h3;}',
  'if(t===\"directions\"){dirH3=h3;}',
  '});',
  'if(ingH3&&dirH3){',
  // Find recipe name: scope search to the ingredient H3's parent container
  'var c=ingH3.parentElement;',
  'if(c){c.querySelectorAll(\"h2\").forEach(function(h2){',
  'var t=h2.innerText.trim();',
  'if(t&&t!==\"Ingredients\"&&t!==\"Directions\"&&!r.title){r.title=t;}',
  '});}',
  // Collect ingredient text from ALL elements between Ingredients H3 and Directions H3
  'var ings=[],el=ingH3.nextElementSibling;',
  'while(el&&el!==dirH3){',
  'var t=el.innerText.trim();',
  'if(t){ings.push(t);}',
  'el=el.nextElementSibling;',
  '}',
  'r.ingredients=ings;',
  // Collect instructions from the <div> after Directions H3, split by period
  'var divEl=dirH3.nextElementSibling;',
  'if(divEl){',
  'var txt=divEl.innerText.trim();',
  'r.instructions=txt.split(\".\").map(function(s){return s.trim();}).filter(function(s){return s.length>5;});',
  '}else{r.instructions=[];}',
  '}else{',
  // Fallback: use document title
  'r.title=d.title;r.ingredients=[];r.instructions=[];',
  '}',
  'r.servings=null;r.sourceUrl=d.URL;',
  // Copy to clipboard
  'var j=JSON.stringify(r,null,2);',
  'navigator.clipboard.writeText(j).then(function(){',
  'var ok=r.ingredients&&r.ingredients.length>0&&r.instructions&&r.instructions.length>0;',
  'var e=d.createElement(\"div\");',
  'e.style.cssText=\"position:fixed;top:20px;right:20px;background:\"+(ok?\"#16a34a\":\"#d97706\")+\";color:#fff;padding:16px 24px;border-radius:8px;z-index:99999;font-family:sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2)\";',
  'e.innerHTML=ok?\"<strong>Recipe Copied!</strong><br>Paste into HomeBase to import.\":\"<strong>Partial capture</strong><br>\"+r.title.substring(0,40);',
  'd.body.appendChild(e);',
  'setTimeout(function(){e.remove()},6000)',
  '}).catch(function(){',
  'prompt(\"Copy this recipe JSON manually (Ctrl+C):\",j)',
  '})',
  '})()',
].join('')

const BOOKMARKLET_HREF_STR = BOOKMARKLET_HREF

export function IntegrationsTab({ isAdmin, initialUmamiScriptUrl, initialUmamiSiteId, googleConnected, googleEmail }: IntegrationsTabProps) {
  // Cozi event import
  const [icsFile, setIcsFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Cozi recipe import
  const [recipeJson, setRecipeJson] = useState('')
  const [recipeImportLoading, setRecipeImportLoading] = useState(false)
  const [recipeImportResult, setRecipeImportResult] = useState<{
    success: boolean
    imported?: number
    updated?: number
    skipped?: number
    results?: Array<{ title: string; imported: boolean; summary?: string; reason?: string }>
    error?: string
  } | null>(null)

  // Umami config
  const [umamiScriptUrl, setUmamiScriptUrl] = useState(initialUmamiScriptUrl ?? '')
  const [umamiSiteId, setUmamiSiteId] = useState(initialUmamiSiteId ?? '')
  const [umamiSaving, setUmamiSaving] = useState(false)
  const [umamiStatus, setUmamiStatus] = useState<Status>(null)

  async function handleCoziImport() {
    if (!icsFile) return
    if (!icsFile.name.toLowerCase().endsWith('.ics')) {
      setImportResult({ success: false, error: 'Please select a .ics file.' })
      return
    }
    setImportLoading(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('ics', icsFile)
      const res = await fetch('/api/import/cozi', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ success: false, error: data.error ?? 'Import failed' })
      } else {
        setImportResult({ success: true, eventCount: data.eventCount, message: data.message })
      }
    } catch {
      setImportResult({ success: false, error: 'Network error.' })
    } finally {
      setImportLoading(false)
    }
  }

  async function handleRecipeImport() {
    if (!recipeJson.trim()) {
      toast.error('Paste the recipe data first')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(recipeJson.trim())
    } catch {
      toast.error('Invalid JSON. Make sure you copied the full recipe data.')
      return
    }

    // Auto-detect batch (array) vs single (object)
    const isBatch = Array.isArray(parsed)
    const mode = isBatch ? 'json-array' : 'json'

    setRecipeImportLoading(true)
    setRecipeImportResult(null)
    try {
      const res = await fetch('/api/import/cozi-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          data: parsed,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setRecipeImportResult({ success: false, error: result.error ?? 'Import failed' })
      } else {
        setRecipeImportResult(result)
        if (result.imported > 0 || result.updated > 0) {
          setRecipeJson('')
        }
      }
    } catch {
      setRecipeImportResult({ success: false, error: 'Network error.' })
    } finally {
      setRecipeImportLoading(false)
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
      <GoogleCalendarCard googleConnected={googleConnected} googleEmail={googleEmail} />
      {isAdmin && <TunnelCard />}

      {/* Cozi Event Import — admin only */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <CardTitle>Import from Cozi — Events</CardTitle>
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
            <div role="alert" className={'flex items-start gap-2 text-sm p-3 rounded-md ' + (importResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive')}>
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
      )}

      {/* Cozi Recipe Import — admin only */}
      {isAdmin && (
      <Card>
        <CardHeader>
          <CardTitle>Import from Cozi — Recipes</CardTitle>
          <CardDescription>
            Cozi doesn't have a built-in recipe export, but you can use the <strong>bookmarklet</strong> below to extract recipes from Cozi's web app and import them here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bookmarklet */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium mb-1">Step 1: Install the bookmarklet</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Drag the button below to your browser's bookmarks bar. Then open a recipe on Cozi's web app and click the bookmarklet.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(BOOKMARKLET_HREF_STR)
                      .then(() => toast.success('Bookmarklet code copied! Create a new browser bookmark and paste this as the URL.'))
                      .catch(() => toast.error('Could not copy. Select the code below and copy it manually.'))
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Copy Bookmarklet Code
                </button>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">How to install:</p>
                  <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                    <li>Click the button above to copy the code</li>
                    <li>Open your browser's bookmarks manager</li>
                    <li>Create a new bookmark with any name (e.g. &ldquo;Cozi Extract&rdquo;)</li>
                    <li>Paste the copied code as the URL field</li>
                    <li>Open a recipe on Cozi's web app and click the bookmark</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium mb-1">Step 2: Paste the extracted recipe</p>
                <p className="text-xs text-muted-foreground mb-2">
                  After clicking the bookmarklet on a Cozi recipe page, come back here and paste the data below.
                </p>
              </div>
            </div>
            <textarea
              className={textareaClass}
              placeholder={'Paste recipe JSON here...\n\nAfter clicking the bookmarklet on a Cozi recipe page,\nthe recipe data will be copied to your clipboard.\nCome back here and paste it (Ctrl+V / Cmd+V).'}
              value={recipeJson}
              onChange={(e) => setRecipeJson(e.target.value)}
            />
            <Button
              type="button"
              onClick={handleRecipeImport}
              disabled={!recipeJson.trim() || recipeImportLoading}
            >
              {recipeImportLoading ? 'Importing...' : 'Import Recipe'}
            </Button>
          </div>

          {/* Import results */}
          {recipeImportResult && (
            <div className="space-y-2">
              {recipeImportResult.success ? (
                <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Import complete</p>
                    <p className="text-xs mt-0.5">
                      {(recipeImportResult.imported ?? 0) > 0 && ((recipeImportResult.imported ?? 0) + ' new recipe' + ((recipeImportResult.imported ?? 0) !== 1 ? 's' : '') + ' imported')}
                      {(recipeImportResult.imported ?? 0) > 0 && (recipeImportResult.updated ?? 0) > 0 && ' \u00B7 '}
                      {(recipeImportResult.updated ?? 0) > 0 && ((recipeImportResult.updated ?? 0) + ' updated')}
                      {(recipeImportResult.skipped ?? 0) > 0 && (' \u00B7 ' + (recipeImportResult.skipped ?? 0) + ' skipped')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{recipeImportResult.error ?? 'Import failed'}</span>
                </div>
              )}

              {/* Per-recipe results */}
              {recipeImportResult.results && recipeImportResult.results.length > 0 && (
                <div className="border rounded-md divide-y text-sm max-h-48 overflow-y-auto">
                  {recipeImportResult.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      {r.imported ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : r.reason ? (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      )}
                      <span className="font-medium truncate">{r.title || '(untitled)'}</span>
                      {r.imported && r.summary && (
                        <span className="text-xs text-muted-foreground truncate">{r.summary}</span>
                      )}
                      {r.reason && (
                        <span className="text-xs text-muted-foreground">{r.reason}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Recipes are imported into the &ldquo;Cozi Import&rdquo; recipe book. Duplicate titles within the same book will be updated instead of duplicated.
          </p>
        </CardContent>
      </Card>
      )}

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
                  onChange={e => { setUmamiScriptUrl(e.target.value); setUmamiStatus(null) }}
                  placeholder="https://your-umami-instance.com/script.js"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="umami-site-id">Website ID</Label>
                <Input
                  id="umami-site-id"
                  value={umamiSiteId}
                  onChange={e => { setUmamiSiteId(e.target.value); setUmamiStatus(null) }}
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
                <div role="alert" className={'flex items-start gap-2 text-sm p-3 rounded-md ' + (umamiStatus.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive')}>
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
