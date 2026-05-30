'use client'

import { useState } from 'react'
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
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import type { DocumentData } from './DocumentCard'

const CATEGORY_LABELS: Record<string, string> = {
  financial: 'Financial',
  tax: 'Tax',
  legal: 'Legal',
  other: 'Other',
}

type PdfTemplate = 'blank' | 'text' | 'table'

interface TemplateOption {
  id: PdfTemplate
  label: string
  description: string
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'blank',
    label: 'Blank Document',
    description: 'A simple blank PDF with a title and generation date.',
  },
  {
    id: 'text',
    label: 'Text Document',
    description: 'Convert plain text lines into a formatted PDF document.',
  },
  {
    id: 'table',
    label: 'Table Report',
    description: 'Create a structured table report with headers and rows.',
  },
]

interface GeneratePdfDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (doc: DocumentData) => void
  /** Pre-fill table data for finance reports etc. */
  prefill?: {
    type: 'table'
    meta: { title: string; subtitle?: string; dateRange?: string }
    columns: { header: string; key: string; width: number; align?: 'left' | 'right'; format?: 'text' | 'currency' }[]
    rows: Record<string, string | number>[]
  }
}

export function GeneratePdfDialog({ open, onOpenChange, onGenerated, prefill }: GeneratePdfDialogProps) {
  const familyTimezone = useFamilyTimezone()
  const [template, setTemplate] = useState<PdfTemplate>(prefill?.type ?? 'blank')
  const [title, setTitle] = useState(prefill?.meta.title ?? '')
  const [subtitle, setSubtitle] = useState(prefill?.meta.subtitle ?? '')
  const [textContent, setTextContent] = useState('')
  const [category, setCategory] = useState('financial')
  const [saveToVault, setSaveToVault] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Reset when opened without prefill
  function handleOpenChange(open: boolean) {
    if (!open) {
      if (!prefill) {
        setTemplate('blank')
        setTitle('')
        setSubtitle('')
        setTextContent('')
        setCategory('financial')
        setSaveToVault(true)
      }
    }
    onOpenChange(open)
  }

  async function handleGenerate() {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    setGenerating(true)
    try {
      let payload: Record<string, unknown>

      switch (template) {
        case 'blank':
          payload = {
            type: 'blank',
            title: title.trim(),
            ...(saveToVault ? {
              saveToVault: {
                title: title.trim(),
                category,
              },
            } : {}),
          }
          break

        case 'text':
          if (!textContent.trim()) {
            toast.error('Please enter some text content')
            setGenerating(false)
            return
          }
          payload = {
            type: 'text',
            title: title.trim(),
            subtitle: subtitle || undefined,
            body: textContent.split('\n'),
            ...(saveToVault ? {
              saveToVault: {
                title: title.trim(),
                category,
              },
            } : {}),
          }
          break

        case 'table':
          if (prefill) {
            payload = {
              type: 'table',
              meta: {
                title: title.trim(),
                subtitle: prefill.meta.subtitle,
                dateRange: prefill.meta.dateRange,
                generatedAt: new Date().toLocaleString('en-AU', { timeZone: familyTimezone }),
              },
              columns: prefill.columns,
              rows: prefill.rows,
              ...(saveToVault ? {
                saveToVault: {
                  title: title.trim(),
                  category,
                },
              } : {}),
            }
          } else {
            toast.error('Table template requires data. Select a different template or use the report export buttons.')
            setGenerating(false)
            return
          }
          break

        default:
          throw new Error('Invalid template')
      }

      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(err.error ?? 'Generation failed')
      }

      if (saveToVault) {
        const doc = await res.json()
        onGenerated(doc as DocumentData)
        toast.success(`PDF "${title}" saved to Vault`)
      } else {
        // Return as download
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = window.document.createElement('a')
        a.href = url
        a.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '')}.pdf`
        window.document.body.appendChild(a)
        a.click()
        window.document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('PDF downloaded')
      }

      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setGenerating(false)
    }
  }

  const isTablePrefilled = template === 'table' && prefill !== undefined

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Generate PDF</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 py-4 flex-1 overflow-y-auto">
          {/* Template selection (only if no prefill) */}
          {!prefill && (
            <div className="space-y-1.5">
              <Label>Template</Label>
              <div className="grid grid-cols-1 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      template === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <FileText className={`h-5 w-5 mt-0.5 shrink-0 ${
                      template === t.id ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="gen-title">Title *</Label>
            <Input
              id="gen-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My Document"
            />
          </div>

          {/* Subtitle (text template only) */}
          {template === 'text' && (
            <div className="space-y-1.5">
              <Label htmlFor="gen-subtitle">Subtitle (optional)</Label>
              <Input
                id="gen-subtitle"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="A brief description"
              />
            </div>
          )}

          {/* Text content (text template only) */}
          {template === 'text' && (
            <div className="space-y-1.5">
              <Label htmlFor="gen-text">Content</Label>
              <textarea
                id="gen-text"
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Enter your text content here. Each line becomes a paragraph."
                rows={8}
                className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Each line becomes a separate paragraph. Use &ldquo;---&ldquo; on its own line for a horizontal rule.
              </p>
            </div>
          )}

          {/* Table data indicator */}
          {isTablePrefilled && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/30">
              <p className="text-sm font-medium text-primary">
                Table Report: {prefill.meta.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {prefill.columns.length} columns × {prefill.rows.length} rows
                {prefill.meta.dateRange ? ` · ${prefill.meta.dateRange}` : ''}
              </p>
            </div>
          )}

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="gen-category">Category</Label>
            <Select value={category} onValueChange={(v) => { if (v !== null) setCategory(v) }}>
              <SelectTrigger id="gen-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Save to Vault toggle */}
          <div className="flex items-center justify-between p-3 border border-input rounded-md bg-muted/30">
            <div>
              <p className="text-sm font-medium">Save to Document Vault</p>
              <p className="text-xs text-muted-foreground">
                {saveToVault
                  ? 'PDF will be saved to your Document Vault for viewing and management.'
                  : 'PDF will be downloaded directly as a file.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSaveToVault(!saveToVault)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                saveToVault ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
              aria-checked={saveToVault}
              role="switch"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                saveToVault ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            onClick={handleGenerate}
            disabled={generating || !title.trim()}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-1" />
                {saveToVault ? 'Save to Vault' : 'Download PDF'}
              </>
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
