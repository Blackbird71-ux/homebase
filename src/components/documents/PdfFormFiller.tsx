'use client'

import { useState, useEffect, useCallback } from 'react'
import { PdfRenderer } from './PdfRenderer'
import { Loader2, Save, Download, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { DetectedFormField } from '@/lib/pdf/form-fields'

interface PdfFormFillerProps {
  pdfUrl: string
  documentId: string
  documentTitle: string
}

export function PdfFormFiller({ pdfUrl, documentId, documentTitle }: PdfFormFillerProps) {
  const [fields, setFields] = useState<DetectedFormField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  // Load form fields
  useEffect(() => {
    let cancelled = false

    async function loadFields() {
      try {
        const res = await fetch(`/api/documents/${documentId}/form-fields`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to load' }))
          throw new Error(err.error ?? 'Failed to load form fields')
        }

        const data = await res.json()
        if (cancelled) return

        setFields(data.fields ?? [])
        setTotalPages(data.totalPages ?? 0)

        // Initialise values from existing field data
        const initialValues: Record<string, string | boolean> = {}
        for (const f of data.fields ?? []) {
          if (f.value !== null && f.value !== undefined) {
            initialValues[f.name] = f.value as string | boolean
          }
        }
        setValues(initialValues)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load form')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFields()
    return () => { cancelled = true }
  }, [documentId])

  // Update field value
  const setValue = useCallback((name: string, value: string | boolean) => {
    setValues(prev => ({ ...prev, [name]: value }))
  }, [])

  // Save filled form to vault
  const handleSaveToVault = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/form-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, saveAsNew: true }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(err.error ?? 'Failed to save filled form')
      }

      toast.success(`Filled form saved to Vault as "${documentTitle} (filled)"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save form')
    } finally {
      setSaving(false)
    }
  }, [documentId, documentTitle, values])

  // Download filled PDF
  const handleDownload = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/form-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, saveAsNew: false }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error ?? 'Failed to download filled form')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${documentTitle.replace(/[^a-zA-Z0-9 _-]/g, '')}-filled.pdf`
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Filled PDF downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download form')
    } finally {
      setSaving(false)
    }
  }, [documentId, documentTitle, values])

  // Get fields for the current page
  const pageFields = fields.filter(f => f.pageIndex === page - 1)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Detecting form fields...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-3 text-destructive opacity-70" />
        <p className="text-sm font-medium">Failed to load form</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    )
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm font-medium">No form fields detected</p>
        <p className="text-xs mt-1">This PDF does not contain any interactive form fields.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Controls bar */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {fields.length} field{fields.length !== 1 ? 's' : ''} detected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={handleDownload}
            disabled={saving}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Download
          </Button>
          <Button
            size="xs"
            onClick={handleSaveToVault}
            disabled={saving}
          >
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1" /> Save to Vault</>
            )}
          </Button>
        </div>
      </div>

      {/* PDF viewer with form overlay */}
      <div className="flex-1 relative overflow-hidden rounded-md border border-border bg-muted/20">
        <PdfRenderer
          url={pdfUrl}
          zoom={zoom}
          page={page}
          onPagesLoaded={setTotalPages}
          onPageChange={setPage}
        />

        {/* Form field overlays */}
        {pageFields.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full pointer-events-auto">
              {pageFields.map((field) => {
                // Convert PDF coordinates (bottom-left) to screen coordinates (top-left)
                // This is an approximation since we don't have the exact canvas position
                const style: React.CSSProperties = {
                  position: 'absolute',
                  left: `${(field.rect.x / 612) * 100}%`,
                  top: `${((field.pageHeight - field.rect.y - field.rect.height) / field.pageHeight) * 100}%`,
                  width: `${(field.rect.width / 612) * 100}%`,
                  height: `${(field.rect.height / field.pageHeight) * 100}%`,
                }

                const value = values[field.name] ?? field.value ?? ''

                return (
                  <div key={field.name} style={style} className="group">
                    {field.type === 'checkbox' ? (
                      <label className="flex items-center gap-1 cursor-pointer bg-background/80 hover:bg-background rounded px-0.5">
                        <input
                          type="checkbox"
                          checked={value === true || value === 'true' || value === 'Yes'}
                          onChange={e => setValue(field.name, e.target.checked)}
                          disabled={field.readonly}
                          className="w-4 h-4"
                        />
                        <span className="text-[10px] text-muted-foreground truncate">{field.name}</span>
                      </label>
                    ) : field.type === 'dropdown' || field.type === 'list' ? (
                      <select
                        value={String(value)}
                        onChange={e => setValue(field.name, e.target.value)}
                        disabled={field.readonly}
                        className="w-full h-full text-[9px] bg-background/80 hover:bg-background border border-primary/30 rounded px-0.5 truncate"
                      >
                        <option value="">—</option>
                        {(field.options ?? []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'signature' ? (
                      <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground bg-muted/30 border border-dashed border-border rounded">
                        Signature field
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={String(value)}
                        onChange={e => setValue(field.name, e.target.value)}
                        disabled={field.readonly}
                        placeholder={field.required ? `${field.name} *` : field.name}
                        className={`w-full h-full text-[9px] bg-background/80 hover:bg-background border border-primary/30 rounded px-0.5 ${
                          field.required && !value ? 'border-destructive/50' : ''
                        }`}
                      />
                    )}
                    {/* Field name tooltip on hover */}
                    <div className="absolute -top-4 left-0 hidden group-hover:block bg-popover text-[8px] text-popover-foreground px-1 rounded shadow whitespace-nowrap z-20">
                      {field.name}{field.required ? ' *' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Zoom */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
            className="p-1 hover:bg-accent rounded text-xs text-muted-foreground"
          >
            -
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="p-1 hover:bg-accent rounded text-xs text-muted-foreground"
          >
            +
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {totalPages > 1 && `Page ${page} of ${totalPages} · `}
          Click fields to fill · {fields.filter(f => values[f.name] && values[f.name] !== '').length}/{fields.length} filled
        </p>
      </div>
    </div>
  )
}
