'use client'

import { useEffect, useState } from 'react'
import { EyeOff, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'

export interface Category {
  id: string
  name: string
  type: string
  parentId: string | null
  color: string | null
  icon: string | null
  isSystem: boolean
  level: number
  isPersonal: boolean
  isLocationBased: boolean
  isExternal: boolean
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  taxDisplayLabel: string | null
  glCode: string | null
  openingBalance: number | null
  openingBalanceDate: string | null
  gstApplicable: boolean
  gstRate: number
  parent?: { id: string; name: string } | null
  children?: Category[]
  _count?: { transactions: number; recurringBills: number; incomeEntries: number }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Category | null
  availableParents: Category[]
  onSaved: () => void
}

const EMPTY_FORM = {
  name: '', type: 'expense', parentId: '', color: '#6366F1', icon: '',
  isPersonal: false, isLocationBased: false, isExternal: false,
  isTaxDeduction: false, taxIncludeInReporting: false, taxDisplayLabel: '',
  glCode: '', gstApplicable: false, gstRate: 10,
}

export function CategoryDialog({ open, onOpenChange, editing, availableParents, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        name: editing.name, type: editing.type, parentId: editing.parentId ?? '',
        color: editing.color ?? '#6366F1', icon: editing.icon ?? '',
        isPersonal: editing.isPersonal, isLocationBased: editing.isLocationBased,
        isExternal: editing.isExternal, isTaxDeduction: editing.isTaxDeduction,
        taxIncludeInReporting: editing.taxIncludeInReporting,
        taxDisplayLabel: editing.taxDisplayLabel ?? '', glCode: editing.glCode ?? '',
        gstApplicable: editing.gstApplicable ?? false, gstRate: editing.gstRate ?? 10,
      } : { ...EMPTY_FORM })
      setErrors({})
    }
  }, [open, editing])

  async function handleSave() {
    if (!form.name.trim()) { setErrors({ name: 'Name is required' }); return }
    setSaving(true)
    try {
      const payload = editing
        ? { id: editing.id, ...form, parentId: form.parentId || null, glCode: form.glCode || null }
        : { ...form, parentId: form.parentId || null, glCode: form.glCode || null }
      const res = await fetch('/api/finance/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editing ? 'Account updated' : 'Account created')
        onOpenChange(false)
        onSaved()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save account')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onOpenChange(false); setErrors({}) } }}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
        </DialogHeader>

        {Object.keys(errors).length > 0 && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mb-2">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Please fix the following errors:</p>
            <ul className="list-disc list-inside text-xs text-red-600/80 dark:text-red-400/80 space-y-0.5">
              {Object.entries(errors).map(([key, msg]) => <li key={key}>{msg}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); if (errors.name) setErrors(p => ({ ...p, name: '' })) }}
              onKeyDown={handleKeyDown}
              className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
              autoFocus
              disabled={saving}
            />
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">GL Code (optional)</label>
            <input
              value={form.glCode}
              onChange={e => setForm(p => ({ ...p, glCode: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 1001, 2100, 4000"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" disabled={saving}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Parent Account</label>
            <select value={form.parentId} onChange={e => setForm(p => ({ ...p, parentId: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" disabled={saving}>
              <option value="">None (root)</option>
              {availableParents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
            <ColorPicker value={form.color} onChange={newColor => setForm(p => ({ ...p, color: newColor }))} disabled={saving} />
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {(form.type === 'expense' || form.type === 'transfer') && (
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isTaxDeduction}
                  onChange={e => setForm(p => ({ ...p, isTaxDeduction: e.target.checked }))} disabled={saving} />
                <span className="text-orange-600 dark:text-orange-400 font-medium">Tax Deduction</span>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.taxIncludeInReporting}
                onChange={e => setForm(p => ({ ...p, taxIncludeInReporting: e.target.checked }))} disabled={saving} />
              <span className="text-amber-600 dark:text-amber-400 font-medium">Include in Tax Report</span>
            </label>
            {form.taxIncludeInReporting && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Display label:</label>
                <input value={form.taxDisplayLabel}
                  onChange={e => setForm(p => ({ ...p, taxDisplayLabel: e.target.value }))}
                  placeholder="e.g. Rental Income, Interest, Voluntary Super"
                  className="w-full sm:w-52 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  disabled={saving} />
              </div>
            )}
            <span className="text-muted-foreground/40 mx-1 select-none">|</span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isPersonal}
                onChange={e => setForm(p => ({ ...p, isPersonal: e.target.checked }))} disabled={saving} />
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              Personal (private to me)
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isLocationBased}
                onChange={e => setForm(p => ({ ...p, isLocationBased: e.target.checked }))} disabled={saving} />
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Location Based
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isExternal}
                onChange={e => setForm(p => ({ ...p, isExternal: e.target.checked }))} disabled={saving} />
              External
            </label>
          </div>

          {(form.type === 'expense' || form.type === 'income') && (
            <div className="sm:col-span-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wide">
                  GST / Tax Settings
                </span>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.gstApplicable}
                    onChange={e => setForm(p => ({ ...p, gstApplicable: e.target.checked }))} disabled={saving} />
                  <span className="font-medium">Auto-split GST on transactions</span>
                </label>
              </div>
              {form.gstApplicable && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">GST rate (%):</label>
                  <input type="number" min={0} max={100} step={0.1} value={form.gstRate}
                    onChange={e => setForm(p => ({ ...p, gstRate: parseFloat(e.target.value) || 10 }))}
                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-center"
                    disabled={saving} />
                  <p className="text-xs text-muted-foreground">
                    When a cleared transaction uses this category, HomeBase will automatically
                    post a journal entry splitting the GST-inclusive amount into
                    ex-GST {form.type === 'expense' ? '+ GST ITC' : '+ GST Collected'}.
                  </p>
                </div>
              )}
              {!form.gstApplicable && (
                <p className="text-xs text-muted-foreground">
                  Enable to have HomeBase automatically post a 3-line GST journal
                  whenever a cleared transaction is recorded against this category.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
