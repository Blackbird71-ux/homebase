'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHero } from '@/components/shared/PageHero'
import { DocumentCard, type DocumentData } from '@/components/documents/DocumentCard'
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog'
import { Plus, Search, AlertTriangle, FileText, Bell } from 'lucide-react'
import { PillNav } from '@/components/shared/PillNav'

const CATEGORY_LABELS: Record<string, string> = {
  all:        'All',
  insurance:  'Insurance',
  warranty:   'Warranty',
  passport:   'Passport',
  id:         'ID',
  medical:    'Medical',
  financial:  'Financial',
  legal:      'Legal',
  tax:        'Tax',
  education:  'Education',
  vehicle:    'Vehicle',
  property:   'Property',
  other:      'Other',
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentData[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showExpiringOnly, setShowExpiringOnly] = useState(false)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const params = new URLSearchParams()
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (showExpiringOnly) params.set('expiringSoon', 'true')
      const res = await fetch(`/api/documents?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      setDocuments(await res.json())
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, showExpiringOnly])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const filtered = documents.filter((doc) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.notes?.toLowerCase().includes(q) ||
      doc.category.toLowerCase().includes(q)
    )
  })

  const expiringCount = documents.filter((doc) => {
    if (!doc.expiryDate) return false
    const days = (new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return days > 0 && days <= doc.remindBefore
  }).length

  const expiredCount = documents.filter((doc) => {
    if (!doc.expiryDate) return false
    return new Date(doc.expiryDate) < new Date()
  }).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-0">

        <PageHero
          title="Document Vault"
          subtitle={`Store and manage household documents${expiringCount > 0 ? ` · ${expiringCount} expiring soon` : ''}${expiredCount > 0 ? ` · ${expiredCount} expired` : ''}`}
          actions={
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Upload
            </Button>
          }
        />

        {/* Category filter pills */}
        <div className="overflow-x-auto mb-3 pb-1">
          <PillNav
            items={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ id: value, label }))}
            active={categoryFilter}
            onChange={setCategoryFilter}
            size="sm"
          />
        </div>

        {/* Search + expiring toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <PillNav
            items={[{ id: 'expiring', label: 'Expiring Soon', icon: Bell }]}
            active={showExpiringOnly ? 'expiring' : ''}
            onChange={() => setShowExpiringOnly((v) => !v)}
            size="sm"
          />
        </div>
      </div>

      {/* Document grid */}
      <div className="flex-1 p-4 md:p-6 pt-0">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mb-3 text-destructive opacity-70" />
            <p className="text-lg font-medium">Failed to load documents</p>
            <p className="text-sm mt-1">There was a problem connecting to the server.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchDocuments}>Try again</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No documents found</p>
            <p className="text-sm mt-1">
              {search || categoryFilter !== 'all' || showExpiringOnly
                ? 'Try adjusting your filters'
                : 'Upload your first household document'}
            </p>
            {!search && categoryFilter === 'all' && !showExpiringOnly && (
              <Button variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />Upload Document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onDeleted={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
                onUpdated={(updated) => setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))}
              />
            ))}
          </div>
        )}
      </div>

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(doc) => setDocuments((prev) => [doc, ...prev])}
      />
    </div>
  )
}
