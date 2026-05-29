'use client'

import {
  RefreshCw, AlertTriangle,
  TrendingDown, TrendingUp,
} from 'lucide-react'
import { PageHero } from '@/components/shared/PageHero'
import {
  Dialog, DialogHeader, DialogTitle, DialogFooter,
  ResizableDialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTemplatesCrud } from '@/hooks/finance/useTemplateCrud'
import { TemplateFormDialog } from '@/components/finance/TemplateFormDialog'
import { TemplateListRow } from '@/components/finance/TemplateListRow'

export function TemplatesClient({ timezone }: { timezone: string }) {
  const {
    templates, glAccounts, contacts, accounts, categories, entities, members, locations,
    form, setForm, errors, setErrors, tab, setTab,
    saving, showForm, editId, deleteTarget, setDeleteTarget,
    openCreate, openEdit, closeForm, handleSave, handleToggleEnabled, handleDelete,
  } = useTemplatesCrud()

  const byNextDate = (a: typeof templates[0], b: typeof templates[0]) => {
    const aDate = a.nextOccurrenceDate ? new Date(a.nextOccurrenceDate).getTime() : Infinity
    const bDate = b.nextOccurrenceDate ? new Date(b.nextOccurrenceDate).getTime() : Infinity
    return aDate - bDate
  }
  const bills   = templates.filter(t => t.kind === 'bill').sort(byNextDate)
  const incomes = templates.filter(t => t.kind === 'income').sort(byNextDate)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <PageHero
        title="Recurring Templates"
        subtitle={`${templates.length} template${templates.length !== 1 ? 's' : ''} · ${templates.filter(t => t.enabled).length} active`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => openCreate('bill')}
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950"
            >
              <TrendingDown className="h-3.5 w-3.5" /> New Bill
            </Button>
            <Button
              onClick={() => openCreate('income')}
              size="sm"
              variant="outline"
              className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-950"
            >
              <TrendingUp className="h-3.5 w-3.5" /> New Income
            </Button>
          </div>
        }
      />

      {/* Bills section */}
      {bills.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Bills ({bills.length})
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border">
            {bills.map(t => <TemplateListRow key={t.id} template={t} timezone={timezone} onEdit={openEdit} onToggle={handleToggleEnabled} onDelete={setDeleteTarget} />)}
          </div>
        </section>
      )}

      {/* Income section */}
      {incomes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-600" /> Income ({incomes.length})
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border">
            {incomes.map(t => <TemplateListRow key={t.id} template={t} timezone={timezone} onEdit={openEdit} onToggle={handleToggleEnabled} onDelete={setDeleteTarget} />)}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <RefreshCw className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No recurring templates yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create a template to auto-spawn drafts on a schedule.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button onClick={() => openCreate('bill')} size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900">
              <TrendingDown className="h-3.5 w-3.5" /> New Bill
            </Button>
            <Button onClick={() => openCreate('income')} size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900">
              <TrendingUp className="h-3.5 w-3.5" /> New Income
            </Button>
          </div>
        </div>
      )}

      {/* Form dialog */}
      <TemplateFormDialog
        open={showForm}
        onClose={closeForm}
        form={form}
        setForm={setForm}
        errors={errors}
        setErrors={setErrors}
        tab={tab}
        setTab={setTab}
        saving={saving}
        isEdit={!!editId}
        onSave={handleSave}
        contacts={contacts}
        accounts={accounts}
        categories={categories}
        entities={entities}
        members={members}
        locations={locations}
        glAccounts={glAccounts}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <ResizableDialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Delete Template
            </DialogTitle>
          </DialogHeader>
          <div className="px-1 py-2 text-sm space-y-2">
            <p>Delete <span className="font-semibold">{deleteTarget?.name}</span>?</p>
            <p className="text-muted-foreground text-xs">
              Already-spawned drafts keep their own lifecycle. They will no longer link back
              to this template, but can still be approved or cancelled independently.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteTarget!.id)}>
              Delete
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  )
}
