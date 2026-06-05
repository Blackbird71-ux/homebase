'use client'

import { useState, useCallback } from 'react'
import { PlusIcon, WrenchIcon, Trash2Icon, PencilIcon, AlertCircleIcon, ClockIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface MaintenanceRecord {
  id: string
  date: string
  description: string
  cost: number | null
  odometer: number | null
  notes: string | null
  nextDueDate: string | null
  nextDueOdometer: number | null
  createdAt: string
}

interface AssetSummaryRecord {
  id: string
  date: string
  description: string
  nextDueDate: string | null
  nextDueOdometer: number | null
}

interface HomeAsset {
  id: string
  name: string
  category: string
  make: string | null
  model: string | null
  year: number | null
  serialNumber: string | null
  purchaseDate: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  records: AssetSummaryRecord[]
}

interface Props {
  initialAssets: HomeAsset[]
}

const CATEGORIES = [
  { value: 'car',       label: '🚗 Car' },
  { value: 'appliance', label: '🏠 Appliance' },
  { value: 'property',  label: '🏗️ Property' },
  { value: 'other',     label: '🔧 Other' },
]

const CATEGORY_LABELS: Record<string, string> = {
  car: '🚗 Car', appliance: '🏠 Appliance', property: '🏗️ Property', other: '🔧 Other',
}

const emptyAssetForm = {
  name: '', category: 'other', make: '', model: '', year: '', serialNumber: '', purchaseDate: '', notes: '',
}

const emptyRecordForm = {
  date: new Date().toISOString().slice(0, 10),
  description: '', cost: '', odometer: '', notes: '', nextDueDate: '', nextDueOdometer: '',
}

function isDueSoon(nextDueDate: string | null | undefined): boolean {
  if (!nextDueDate) return false
  const due = new Date(nextDueDate)
  const today = new Date()
  const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays <= 30
}

function isOverdue(nextDueDate: string | null | undefined): boolean {
  if (!nextDueDate) return false
  return new Date(nextDueDate) < new Date()
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  // Maintenance dates are stored as UTC midnight of the calendar date (via <input type="date">),
  // so display them in UTC to render the exact day, immune to the viewer's timezone.
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function MaintenanceClient({ initialAssets }: Props) {
  const [assets, setAssets] = useState<HomeAsset[]>(initialAssets)

  // Asset drawer
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [editAssetId, setEditAssetId] = useState<string | null>(null)
  const [assetForm, setAssetForm] = useState(emptyAssetForm)
  const [savingAsset, setSavingAsset] = useState(false)

  // Asset detail drawer
  const [detailAsset, setDetailAsset] = useState<Omit<HomeAsset, 'records'> & { records: MaintenanceRecord[] } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Record drawer
  const [recordDrawerOpen, setRecordDrawerOpen] = useState(false)
  const [recordForm, setRecordForm] = useState(emptyRecordForm)
  const [savingRecord, setSavingRecord] = useState(false)

  // Delete
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null)
  const [deletingAsset, setDeletingAsset] = useState(false)
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null)
  const [deletingRecord, setDeletingRecord] = useState(false)

  const openNewAsset = () => {
    setEditAssetId(null)
    setAssetForm(emptyAssetForm)
    setAssetDrawerOpen(true)
  }

  const openEditAsset = (asset: HomeAsset) => {
    setEditAssetId(asset.id)
    setAssetForm({
      name: asset.name,
      category: asset.category,
      make: asset.make ?? '',
      model: asset.model ?? '',
      year: asset.year != null ? String(asset.year) : '',
      serialNumber: asset.serialNumber ?? '',
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
      notes: asset.notes ?? '',
    })
    setAssetDrawerOpen(true)
  }

  const openDetail = useCallback(async (asset: HomeAsset) => {
    setDetailAsset(asset as Omit<HomeAsset, 'records'> & { records: MaintenanceRecord[] })
    setDetailOpen(true)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/maintenance/assets/${asset.id}`)
      if (res.ok) {
        const full = await res.json()
        setDetailAsset(full)
      }
    } catch { /* keep summary */ }
    finally { setLoadingDetail(false) }
  }, [])

  const handleSaveAsset = useCallback(async () => {
    if (!assetForm.name.trim()) { toast.error('Name is required'); return }
    setSavingAsset(true)
    try {
      const payload = {
        name: assetForm.name.trim(),
        category: assetForm.category,
        make: assetForm.make.trim() || null,
        model: assetForm.model.trim() || null,
        year: assetForm.year ? parseInt(assetForm.year) : null,
        serialNumber: assetForm.serialNumber.trim() || null,
        purchaseDate: assetForm.purchaseDate || null,
        notes: assetForm.notes.trim() || null,
      }
      if (editAssetId) {
        const res = await fetch(`/api/maintenance/assets/${editAssetId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        const updated: HomeAsset = await res.json()
        setAssets(prev => prev.map(a => a.id === editAssetId ? { ...updated, records: a.records } : a))
        toast.success('Asset updated')
      } else {
        const res = await fetch('/api/maintenance/assets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        const created: HomeAsset = await res.json()
        setAssets(prev => [...prev, created])
        toast.success('Asset added')
      }
      setAssetDrawerOpen(false)
    } catch { toast.error('Something went wrong') }
    finally { setSavingAsset(false) }
  }, [assetForm, editAssetId])

  const handleDeleteAsset = useCallback(async () => {
    if (!deleteAssetId) return
    setDeletingAsset(true)
    try {
      const res = await fetch(`/api/maintenance/assets/${deleteAssetId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setAssets(prev => prev.filter(a => a.id !== deleteAssetId))
      toast.success('Asset deleted')
      setDeleteAssetId(null)
    } catch { toast.error('Failed to delete') }
    finally { setDeletingAsset(false) }
  }, [deleteAssetId])

  const handleSaveRecord = useCallback(async () => {
    if (!detailAsset) return
    if (!recordForm.date || !recordForm.description.trim()) {
      toast.error('Date and description are required'); return
    }
    setSavingRecord(true)
    try {
      const payload = {
        date: recordForm.date,
        description: recordForm.description.trim(),
        cost: recordForm.cost ? parseFloat(recordForm.cost) : null,
        odometer: recordForm.odometer ? parseInt(recordForm.odometer) : null,
        notes: recordForm.notes.trim() || null,
        nextDueDate: recordForm.nextDueDate || null,
        nextDueOdometer: recordForm.nextDueOdometer ? parseInt(recordForm.nextDueOdometer) : null,
      }
      const res = await fetch(`/api/maintenance/assets/${detailAsset.id}/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      const created: MaintenanceRecord = await res.json()
      setDetailAsset(prev => prev ? { ...prev, records: [created, ...prev.records] } : prev)
      // Update summary record on asset card
      setAssets(prev => prev.map(a => a.id === detailAsset.id
        ? { ...a, records: [{ id: created.id, date: created.date, description: created.description, nextDueDate: created.nextDueDate, nextDueOdometer: created.nextDueOdometer }] }
        : a))
      toast.success('Record added')
      setRecordDrawerOpen(false)
    } catch { toast.error('Something went wrong') }
    finally { setSavingRecord(false) }
  }, [detailAsset, recordForm])

  const handleDeleteRecord = useCallback(async () => {
    if (!deleteRecordId || !detailAsset) return
    setDeletingRecord(true)
    try {
      const res = await fetch(`/api/maintenance/records/${deleteRecordId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDetailAsset(prev => prev ? { ...prev, records: prev.records.filter(r => r.id !== deleteRecordId) } : prev)
      toast.success('Record deleted')
      setDeleteRecordId(null)
    } catch { toast.error('Failed to delete') }
    finally { setDeletingRecord(false) }
  }, [deleteRecordId, detailAsset])

  // Group assets by category
  const grouped = assets.reduce<Record<string, HomeAsset[]>>((acc, a) => {
    if (!acc[a.category]) acc[a.category] = []
    acc[a.category].push(a)
    return acc
  }, {})

  const groupKeys = Object.keys(grouped).sort((a, b) =>
    (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <WrenchIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Maintenance</h1>
        </div>
        <Button size="sm" onClick={openNewAsset}>
          <PlusIcon className="h-4 w-4 mr-1" /> Add asset
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <WrenchIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">No assets tracked yet</p>
            <p className="text-xs">Add a car, appliance, or property to start logging service history.</p>
          </div>
        ) : (
          groupKeys.map(cat => (
            <div key={cat} className="mb-6">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
              <div className="space-y-2">
                {grouped[cat].map(asset => {
                  const lastRecord = asset.records[0]
                  const nextDue = lastRecord?.nextDueDate
                  const overdue = isOverdue(nextDue)
                  const dueSoon = !overdue && isDueSoon(nextDue)
                  return (
                    <Card
                      key={asset.id}
                      className="cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => openDetail(asset)}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{asset.name}</span>
                              {asset.year && (
                                <span className="text-xs text-muted-foreground">{asset.year}</span>
                              )}
                              {overdue && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                                  <AlertCircleIcon className="h-3 w-3" /> Overdue
                                </span>
                              )}
                              {dueSoon && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                                  <ClockIcon className="h-3 w-3" /> Due soon
                                </span>
                              )}
                            </div>
                            {(asset.make || asset.model) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[asset.make, asset.model].filter(Boolean).join(' ')}
                              </p>
                            )}
                            {lastRecord && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Last: {lastRecord.description} · {fmtDate(lastRecord.date)}
                              </p>
                            )}
                            {nextDue && (
                              <p className={`text-xs mt-0.5 ${overdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                Next due: {fmtDate(nextDue)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); openEditAsset(asset) }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteAssetId(asset.id) }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Asset add/edit drawer */}
      <Drawer open={assetDrawerOpen} onOpenChange={setAssetDrawerOpen}>
        <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{editAssetId ? 'Edit asset' : 'Add asset'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ma-name">Name *</Label>
              <Input id="ma-name" value={assetForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Honda CR-V, Daikin AC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-cat">Category</Label>
              <Select value={assetForm.category} onValueChange={(v: string | null) => setAssetForm(f => ({ ...f, category: v ?? 'other' }))}>
                <SelectTrigger id="ma-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ma-make">Make</Label>
                <Input id="ma-make" value={assetForm.make}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, make: e.target.value }))}
                  placeholder="Honda" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-model">Model</Label>
                <Input id="ma-model" value={assetForm.model}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="CR-V" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ma-year">Year</Label>
                <Input id="ma-year" type="number" min="1900" max="2099" value={assetForm.year}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, year: e.target.value }))}
                  placeholder="2022" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-serial">Serial / VIN</Label>
                <Input id="ma-serial" value={assetForm.serialNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, serialNumber: e.target.value }))}
                  placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-purchase">Purchase date</Label>
              <Input id="ma-purchase" type="date" value={assetForm.purchaseDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetForm(f => ({ ...f, purchaseDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-notes">Notes</Label>
              <textarea id="ma-notes" value={assetForm.notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAssetForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setAssetDrawerOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAsset} disabled={savingAsset}>
              {savingAsset ? 'Saving…' : editAssetId ? 'Save changes' : 'Add asset'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Asset detail drawer */}
      <Drawer open={detailOpen} onOpenChange={setDetailOpen}>
        <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{detailAsset?.name ?? 'Asset'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {detailAsset && (
              <>
                {/* Asset meta */}
                <div className="text-sm text-muted-foreground space-y-1 mb-4">
                  {(detailAsset.make || detailAsset.model) && (
                    <p>{[detailAsset.make, detailAsset.model, detailAsset.year].filter(Boolean).join(' ')}</p>
                  )}
                  {detailAsset.serialNumber && <p>S/N: {detailAsset.serialNumber}</p>}
                  {detailAsset.purchaseDate && <p>Purchased: {fmtDate(detailAsset.purchaseDate)}</p>}
                  {detailAsset.notes && <p>{detailAsset.notes}</p>}
                </div>

                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Service history</h3>
                  <Button size="sm" variant="outline" onClick={() => {
                    setRecordForm({ ...emptyRecordForm, date: new Date().toISOString().slice(0, 10) })
                    setRecordDrawerOpen(true)
                  }}>
                    <PlusIcon className="h-3.5 w-3.5 mr-1" /> Add record
                  </Button>
                </div>

                {loadingDetail ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
                ) : (detailAsset as HomeAsset & { records: MaintenanceRecord[] }).records?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No service records yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(detailAsset.records ?? []).map(r => (
                      <div key={r.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{r.description}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span>{fmtDate(r.date)}</span>
                              {r.cost != null && <span>${r.cost.toFixed(2)}</span>}
                              {/* eslint-disable-next-line no-restricted-syntax -- odometer is a number, not a date */}
                              {r.odometer != null && <span>{r.odometer.toLocaleString()} km</span>}
                            </div>
                            {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                            {r.nextDueDate && (
                              <p className={`text-xs mt-1 ${isOverdue(r.nextDueDate) ? 'text-red-600' : isDueSoon(r.nextDueDate) ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                Next due: {fmtDate(r.nextDueDate)}
                                {/* eslint-disable-next-line no-restricted-syntax -- odometer is a number, not a date */}
                                {r.nextDueOdometer != null && ` / ${r.nextDueOdometer.toLocaleString()} km`}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => setDeleteRecordId(r.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Add record drawer */}
      <Drawer open={recordDrawerOpen} onOpenChange={setRecordDrawerOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Add service record</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mr-date">Date *</Label>
              <Input id="mr-date" type="date" value={recordForm.date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-desc">Description *</Label>
              <Input id="mr-desc" value={recordForm.description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Oil change + filter" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mr-cost">Cost ($)</Label>
                <Input id="mr-cost" type="number" min="0" step="0.01" value={recordForm.cost}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, cost: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-odo">Odometer (km)</Label>
                <Input id="mr-odo" type="number" min="0" value={recordForm.odometer}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, odometer: e.target.value }))}
                  placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mr-next-date">Next due date</Label>
                <Input id="mr-next-date" type="date" value={recordForm.nextDueDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, nextDueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-next-odo">Next due km</Label>
                <Input id="mr-next-odo" type="number" min="0" value={recordForm.nextDueOdometer}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordForm(f => ({ ...f, nextDueOdometer: e.target.value }))}
                  placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-notes">Notes</Label>
              <textarea id="mr-notes" value={recordForm.notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRecordForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Parts used, workshop name, etc."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setRecordDrawerOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRecord} disabled={savingRecord}>
              {savingRecord ? 'Saving…' : 'Add record'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete asset confirm */}
      <Drawer open={!!deleteAssetId} onOpenChange={(open: boolean) => { if (!open) setDeleteAssetId(null) }}>
        <DrawerContent className="sm:max-w-[400px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Delete asset?</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-3 text-sm text-muted-foreground">
            This will delete the asset and all its service records.
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setDeleteAssetId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAsset} disabled={deletingAsset}>
              {deletingAsset ? 'Deleting…' : 'Delete'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete record confirm */}
      <Drawer open={!!deleteRecordId} onOpenChange={(open: boolean) => { if (!open) setDeleteRecordId(null) }}>
        <DrawerContent className="sm:max-w-[400px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Delete record?</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-3 text-sm text-muted-foreground">
            This will permanently remove the service record.
          </div>
          <DrawerFooter className="border-t border-border">
            <Button variant="outline" onClick={() => setDeleteRecordId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRecord} disabled={deletingRecord}>
              {deletingRecord ? 'Deleting…' : 'Delete'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
