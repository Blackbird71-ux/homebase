'use client'

import {
  Plus, Trash2, TrendingDown, TrendingUp, CalendarClock, ChevronDown, Info,
} from 'lucide-react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatInTz } from '@/lib/timezone'
import { sortedCategoryList } from '@/lib/finance-categories'
import { JournalLinesEditor } from '@/components/finance/JournalLinesEditor'
import { previewOccurrences } from '@/lib/finance-recurrence-utils'
import { FREQ_LABELS, MONTH_NAMES } from '@/lib/finance-template-helpers'
import type {
  FormState, Tab, ContactRow, AccountRow, CategoryRow,
  EntityRow, MemberRow, LocationRow, PayslipLine,
} from '@/lib/finance-template-helpers'

import { useMemo, useState } from 'react'
import type { GLAccount } from '@/components/finance/JournalLinesEditor'

// ── GL account select helper ──────────────────────────────────────────────────

function GLAccountSelect({
  value, onChange, glAccounts, placeholder = 'Select account…', className,
}: {
  value: string
  onChange: (v: string) => void
  glAccounts: GLAccount[]
  placeholder?: string
  className?: string
}) {
  const grouped = useMemo(() => {
    const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
    const result: GLAccount[] = []
    for (const type of typeOrder) {
      const roots = glAccounts.filter(a => a.type === type && !a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      const children = glAccounts.filter(a => a.type === type && a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      for (const root of roots) {
        result.push(root)
        result.push(...children.filter(c => c.parentId === root.id))
      }
    }
    return result
  }, [glAccounts])

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn('w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm', className)}
    >
      <option value="">{placeholder}</option>
      {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
        const group = grouped.filter(a => a.type === type)
        if (!group.length) return null
        return (
          <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
            {group.map(a => (
              <option key={a.id} value={a.id}>
                {a.parentId ? '— ' : ''}{a.glCode ? `[${a.glCode}] ` : ''}{a.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

// ── Tooltip icon ─────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex items-center ml-1 cursor-help align-middle">
      <Info className="h-3 w-3 text-muted-foreground/50" />
    </span>
  )
}

// ── Schedule preview (collapsed — expands on hover) ───────────────────────────

function SchedulePreview({ preview, endMode }: { preview: Date[]; endMode: string }) {
  if (preview.length === 0) return null
  const summaryDates = preview.slice(0, 3).map(d => formatInTz(d, 'UTC', { day: 'numeric', month: 'short' })).join(', ')
  const hasMore = preview.length > 3 || endMode === 'forever'

  return (
    <div className="group">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default select-none">
        <CalendarClock className="h-3 w-3 shrink-0" />
        <span className="underline decoration-dotted underline-offset-2">
          {summaryDates}{hasMore ? '…' : ''}
        </span>
      </div>
      {/* Expands inline on hover — avoids overflow-clip issues with absolutely positioned tooltips */}
      <div className="max-h-0 overflow-hidden group-hover:max-h-44 transition-all duration-200 ease-in-out">
        <div className="rounded-md bg-muted/50 border border-border mt-1.5 p-2.5">
          <ol className="space-y-0.5">
            {preview.map((d, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-muted-foreground w-4 text-right tabular-nums">{i + 1}.</span>
                <span>{formatInTz(d, 'UTC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </li>
            ))}
          </ol>
          {endMode === 'forever' && (
            <p className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border/50">…continues indefinitely</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  form, setForm, errors, isEdit,
  contacts, accounts, categories, entities, members, locations,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  isEdit: boolean
  contacts: ContactRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  entities: EntityRow[]
  members: MemberRow[]
  locations: LocationRow[]
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  const [showMore, setShowMore] = useState(false)
  const hasMoreData = !!(form.locationId || form.memberId || form.notes || form.notifyOnCreate || !form.showOnCalendar || form.categoryId || form.remindInAdvanceDays)

  const categoryOptions = useMemo(
    () => sortedCategoryList(
      categories.filter(c => form.kind === 'bill' ? c.type === 'expense' : c.type === 'income')
    ),
    [categories, form.kind],
  )

  return (
    <div className="space-y-2 p-3">
      {/* Kind toggle — locked on edit */}
      <div>
        <label className="block text-xs font-medium mb-1">Type</label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(['bill', 'income'] as const).map(k => (
            <label key={k} className={cn(
              'flex items-center gap-2 text-sm cursor-pointer',
              isEdit && 'opacity-50 pointer-events-none',
            )}>
              <input
                type="radio"
                name="kind"
                value={k}
                checked={form.kind === k}
                onChange={() => set('kind', k)}
                className="accent-primary"
                disabled={isEdit}
              />
              {k === 'bill'
                ? <><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Bill</>
                : <><TrendingUp className="h-3.5 w-3.5 text-green-600" /> Income</>
              }
            </label>
          ))}
          {isEdit && (
            <span className="text-xs text-muted-foreground">Type cannot be changed after creation.</span>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium shrink-0">Name <span className="text-red-500">*</span></label>
        <div className="flex-1">
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Monthly mortgage, Weekly groceries…"
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.name ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
        </div>
      </div>

      {/* Settings row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="accent-primary" />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.createAutomatically} onChange={e => set('createAutomatically', e.target.checked)} className="accent-primary" />
          Auto-create drafts
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.includeInBudget} onChange={e => set('includeInBudget', e.target.checked)} className="accent-primary" />
          Include in budget
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Counterparty */}
        <div>
          <label className="block text-xs font-medium mb-1">
            {form.kind === 'bill' ? 'Vendor / Payee' : 'Payer / Source'}
          </label>
          <select
            value={form.counterpartyId}
            onChange={e => set('counterpartyId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Bank account */}
        <div>
          <label className="block text-xs font-medium mb-1">Bank Account</label>
          <select
            value={form.accountId}
            onChange={e => set('accountId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Entity */}
        <div>
          <label className="block text-xs font-medium mb-1">Entity / Fund</label>
          <select
            value={form.entityId}
            onChange={e => set('entityId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
        </div>

        {showMore && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1">
                {form.kind === 'bill' ? 'Expense Category' : 'Income Category'}
              </label>
              <select
                value={form.categoryId}
                onChange={e => set('categoryId', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {categoryOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Location</label>
              <select
                value={form.locationId}
                onChange={e => set('locationId', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Assigned To</label>
              <select
                value={form.memberId}
                onChange={e => set('memberId', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.notifyOnCreate} onChange={e => set('notifyOnCreate', e.target.checked)} className="accent-primary" />
                Notify on create
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.showOnCalendar} onChange={e => set('showOnCalendar', e.target.checked)} className="accent-primary" />
                Show on calendar
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Remind … days in advance</label>
              <input
                type="number"
                min="0"
                value={form.remindInAdvanceDays}
                onChange={e => set('remindInAdvanceDays', e.target.value)}
                placeholder="No reminder"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={1}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
              />
            </div>
          </>
        )}

        {/* Create in advance */}
        <div>
          <label className="block text-xs font-medium mb-1">Create draft … days in advance</label>
          <input
            type="number"
            min="0"
            value={form.createInAdvanceDays}
            onChange={e => set('createInAdvanceDays', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>

        {/* Due offset (bills only) — computed from Frequency tab dates */}
        {form.kind === 'bill' && parseInt(form.defaultDueOffsetDays) > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">
              Payment due <strong>{form.defaultDueOffsetDays} day{parseInt(form.defaultDueOffsetDays) !== 1 ? 's' : ''}</strong> after bill date — set via the <em>Frequency</em> tab.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowMore(v => !v)}
        className={cn(
          'flex items-center gap-1 text-xs hover:text-foreground',
          hasMoreData && !showMore ? 'text-amber-500 font-medium' : 'text-muted-foreground',
        )}
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', showMore && 'rotate-180')} />
        {showMore ? 'Fewer options' : 'More options'}
        {hasMoreData && !showMore && <span className="ml-0.5">·</span>}
      </button>

    </div>
  )
}

// ── Frequency tab ─────────────────────────────────────────────────────────────

function FrequencyTab({
  form, setForm, errors, isEdit,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  isEdit?: boolean
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  const [showSpawnOverride, setShowSpawnOverride] = useState(false)

  const showInterval    = form.frequency === 'custom'
  const showDayOfMonth  = ['monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly'].includes(form.frequency)
  const showMonthOfYear = form.frequency === 'yearly'

  const preview = useMemo(() => {
    if (!form.startDate) return []
    try {
      return previewOccurrences(
        new Date(form.startDate + 'T00:00:00Z'),
        form.frequency,
        parseInt(form.interval) || 1,
        form.dayOfMonth ? parseInt(form.dayOfMonth) : null,
        form.monthOfYear ? parseInt(form.monthOfYear) : null,
        form.endMode,
        form.endDate ? new Date(form.endDate + 'T00:00:00Z') : null,
        form.totalOccurrences ? parseInt(form.totalOccurrences) : null,
        6,
      )
    } catch {
      return []
    }
  }, [form.startDate, form.frequency, form.interval, form.dayOfMonth, form.monthOfYear,
      form.endMode, form.endDate, form.totalOccurrences])

  return (
    <div className="space-y-1.5 p-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {/* Frequency */}
        <div>
          <label className="block text-xs font-medium mb-0.5">Frequency <span className="text-red-500">*</span></label>
          <select
            value={form.frequency}
            onChange={e => set('frequency', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Interval (custom only) */}
        {showInterval && (
          <div>
            <label className="block text-xs font-medium mb-0.5">Every … days <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="1"
              value={form.interval}
              onChange={e => set('interval', e.target.value)}
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
                errors.interval ? 'border-red-500' : 'border-input',
              )}
            />
            {errors.interval && <p className="text-xs text-red-500 mt-0.5">{errors.interval}</p>}
          </div>
        )}

        {/* Day of month */}
        {showDayOfMonth && (
          <div>
            <label className="block text-xs font-medium mb-0.5">
              Day of month<InfoTip text="1–31, snaps to month-end" />
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={form.dayOfMonth}
              onChange={e => set('dayOfMonth', e.target.value)}
              placeholder="Same as start date"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {/* Month of year (yearly) */}
        {showMonthOfYear && (
          <div>
            <label className="block text-xs font-medium mb-0.5">Month</label>
            <select
              value={form.monthOfYear}
              onChange={e => set('monthOfYear', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Same month as start date</option>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}

        {/* Start date = first bill / invoice date */}
        <div>
          <label className="block text-xs font-medium mb-0.5">
            {form.kind === 'bill' ? 'First bill date' : 'Start date'} <span className="text-red-500">*</span>
            {form.kind === 'bill' && <InfoTip text="Invoice date — hits P&L when approved" />}
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => {
              const newStart = e.target.value
              set('startDate', newStart)
              // Keep the due date offset: if firstDueDate was in sync, advance it too
              if (form.startDate && form.firstDueDate && newStart) {
                const oldOffset = Math.max(0, Math.round(
                  (new Date(form.firstDueDate + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000
                ))
                const newDue = new Date(new Date(newStart + 'T00:00:00').getTime() + oldOffset * 86_400_000)
                setForm(p => ({
                  ...p,
                  startDate: newStart,
                  firstDueDate: newDue.toISOString().slice(0, 10),
                }))
              }
            }}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.startDate ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.startDate && <p className="text-xs text-red-500 mt-0.5">{errors.startDate}</p>}
        </div>

        {/* First due date (bills only) — drives defaultDueOffsetDays */}
        {form.kind === 'bill' && (
          <div>
            <label className="block text-xs font-medium mb-0.5">
              First payment due date<InfoTip text="Sets the bill-to-due offset for this template" />
            </label>
            <input
              type="date"
              value={form.firstDueDate}
              min={form.startDate}
              onChange={e => {
                const dueVal = e.target.value
                const offsetDays = form.startDate && dueVal
                  ? Math.max(0, Math.round(
                      (new Date(dueVal + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000
                    ))
                  : 0
                setForm(p => ({ ...p, firstDueDate: dueVal, defaultDueOffsetDays: String(offsetDays) }))
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            {form.startDate && form.firstDueDate && form.firstDueDate > form.startDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {Math.round((new Date(form.firstDueDate + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000)} days after bill date
              </p>
            )}
          </div>
        )}
      </div>

      {/* End mode */}
      <div>
        <label className="block text-xs font-medium mb-0.5">Ends</label>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {([['forever', 'Never'], ['until', 'On a date'], ['for_n_occurrences', 'After N occurrences']] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="endMode"
                value={v}
                checked={form.endMode === v}
                onChange={() => set('endMode', v)}
                className="accent-primary"
              />
              {l}
            </label>
          ))}
        </div>
      </div>

      {form.endMode === 'until' && (
        <div className="max-w-xs">
          <label className="block text-xs font-medium mb-1">End date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => set('endDate', e.target.value)}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.endDate ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.endDate && <p className="text-xs text-red-500 mt-0.5">{errors.endDate}</p>}
        </div>
      )}

      {form.endMode === 'for_n_occurrences' && (
        <div className="max-w-xs">
          <label className="block text-xs font-medium mb-1">Number of occurrences <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="1"
            value={form.totalOccurrences}
            onChange={e => set('totalOccurrences', e.target.value)}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.totalOccurrences ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.totalOccurrences && <p className="text-xs text-red-500 mt-0.5">{errors.totalOccurrences}</p>}
        </div>
      )}

      {/* Schedule preview — collapsed, expands on hover */}
      <SchedulePreview preview={preview} endMode={form.endMode} />

      {/* Next spawn date — edit only; lets user reset after a deleted draft */}
      {isEdit && (
        <div className="pt-2 border-t border-border mt-1">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={showSpawnOverride}
              onChange={e => {
                setShowSpawnOverride(e.target.checked)
                if (!e.target.checked) set('nextSpawnDate', '')
              }}
              className="accent-primary"
            />
            Override next spawn date
          </label>
          {showSpawnOverride && (
            <div className="mt-1.5 space-y-1.5 pl-5">
              {form.currentNextSpawnDate && (
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-medium text-foreground">{form.currentNextSpawnDate}</span>
                </p>
              )}
              <input
                type="date"
                value={form.nextSpawnDate}
                onChange={e => set('nextSpawnDate', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              {form.nextSpawnDate ? (
                <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Are you sure?</span> Saving will override the computed spawn date and set the next draft to be created on <span className="font-semibold">{form.nextSpawnDate}</span>. Clear this field to let the schedule compute the date automatically.
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Set this to recreate a deleted draft — the spawn service will use this date instead of the computed one.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Transaction tab ───────────────────────────────────────────────────────────

function TransactionTab({
  form, setForm, errors, setErrors, glAccounts,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  glAccounts: GLAccount[]
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  function addPayslipLine(field: 'payslipComponents' | 'payslipDeductions') {
    setForm(p => ({ ...p, [field]: [...p[field], { label: '', amount: '', glAccountId: '' }] }))
  }

  function updatePayslipLine(
    field: 'payslipComponents' | 'payslipDeductions',
    idx: number,
    key: keyof PayslipLine,
    value: string,
  ) {
    setForm(p => ({
      ...p,
      [field]: (p[field] as PayslipLine[]).map((l, i) => i === idx ? { ...l, [key]: value } : l),
    }))
  }

  function removePayslipLine(field: 'payslipComponents' | 'payslipDeductions', idx: number) {
    setForm(p => ({ ...p, [field]: (p[field] as PayslipLine[]).filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-3 p-3">
      {/* Journal lines */}
      <JournalLinesEditor
        lines={form.lines}
        onChange={lines => {
          const primary = form.kind === 'bill'
            ? lines.find(l => l.side === 'debit' && glAccounts.some(a => a.id === l.glAccountId && a.type === 'expense'))
            : lines.find(l => l.side === 'credit' && glAccounts.some(a => a.id === l.glAccountId && a.type === 'income'))
          setForm(p => ({
            ...p,
            lines,
            ...(primary?.glAccountId ? { categoryId: primary.glAccountId } : {}),
          }))
        }}
        glAccounts={glAccounts}
        errors={errors}
        onErrorsClear={keys => setErrors(p => {
          const next = { ...p }
          keys.forEach(k => delete next[k])
          return next
        })}
      />
      {errors.lines && <p className="text-xs text-red-500">{errors.lines}</p>}

      {/* Tax tracking */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.isTaxTracked}
            onChange={e => set('isTaxTracked', e.target.checked)}
            className="accent-primary"
          />
          Track for tax
        </label>
        {form.isTaxTracked && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-xs font-medium mb-1">Estimated tax rate (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.taxRate}
                onChange={e => set('taxRate', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Classification</label>
              <select
                value={form.taxClassification}
                onChange={e => set('taxClassification', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Not classified</option>
                {form.kind === 'bill' ? (
                  <>
                    <option value="tax_deduction">Tax Deduction</option>
                    <option value="tax_payment">Tax Payment (PAYG)</option>
                  </>
                ) : (
                  <>
                    <option value="taxable_income">Taxable Income</option>
                    <option value="exempt_income">Exempt Income</option>
                  </>
                )}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Payslip mode (income only) */}
      {form.kind === 'income' && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.payslipEnabled}
              onChange={e => set('payslipEnabled', e.target.checked)}
              className="accent-primary"
            />
            Payslip mode
          </label>
          {form.payslipEnabled && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">
                At approval, payslip fields override the journal lines above to produce the
                correct multi-leg entry (Gross Income / PAYG / SGC / Net to Bank).
              </p>

              {/* Gross */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Gross pay ($)</label>
                  <input type="number" step="0.01" min="0" value={form.grossPay}
                    onChange={e => set('grossPay', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Gross income GL <span className="text-red-500">*</span></label>
                  <GLAccountSelect
                    value={form.grossIncomeGlAccountId}
                    onChange={v => set('grossIncomeGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                  {errors.grossIncomeGlAccountId && <p className="text-xs text-red-500 mt-0.5">{errors.grossIncomeGlAccountId}</p>}
                </div>
              </div>

              {/* PAYG */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">PAYG withheld ($)</label>
                  <input type="number" step="0.01" min="0" value={form.paygWithheld}
                    onChange={e => set('paygWithheld', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">PAYG GL account</label>
                  <GLAccountSelect
                    value={form.paygGlAccountId}
                    onChange={v => set('paygGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                </div>
              </div>

              {/* SGC */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">SGC super ($)</label>
                  <input type="number" step="0.01" min="0" value={form.sgcAmount}
                    onChange={e => set('sgcAmount', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">SGC accrued asset GL</label>
                  <GLAccountSelect
                    value={form.sgcGlAccountId}
                    onChange={v => set('sgcGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">SGC income GL</label>
                  <GLAccountSelect
                    value={form.sgcIncomeGlAccountId}
                    onChange={v => set('sgcIncomeGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                </div>
              </div>

              {/* Net */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Net take-home ($)</label>
                  <input type="number" step="0.01" min="0" value={form.netPay}
                    onChange={e => set('netPay', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Bank GL account <span className="text-red-500">*</span></label>
                  <GLAccountSelect
                    value={form.bankGlAccountId}
                    onChange={v => set('bankGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                  {errors.bankGlAccountId && <p className="text-xs text-red-500 mt-0.5">{errors.bankGlAccountId}</p>}
                </div>
              </div>

              {/* Pay components */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pay Components</p>
                  <button type="button" onClick={() => addPayslipLine('payslipComponents')}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {form.payslipComponents.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_1fr_28px] gap-1.5 mb-1.5">
                    <input type="text" value={c.label} placeholder="Label"
                      onChange={e => updatePayslipLine('payslipComponents', i, 'label', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input type="number" step="0.01" value={c.amount} placeholder="0.00"
                      onChange={e => updatePayslipLine('payslipComponents', i, 'amount', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right" />
                    <GLAccountSelect value={c.glAccountId}
                      onChange={v => updatePayslipLine('payslipComponents', i, 'glAccountId', v)}
                      glAccounts={glAccounts} />
                    <button type="button" onClick={() => removePayslipLine('payslipComponents', i)}
                      className="p-1 hover:bg-accent rounded text-red-500 mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Deductions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deductions</p>
                  <button type="button" onClick={() => addPayslipLine('payslipDeductions')}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {form.payslipDeductions.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_1fr_28px] gap-1.5 mb-1.5">
                    <input type="text" value={d.label} placeholder="Label"
                      onChange={e => updatePayslipLine('payslipDeductions', i, 'label', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input type="number" step="0.01" value={d.amount} placeholder="0.00"
                      onChange={e => updatePayslipLine('payslipDeductions', i, 'amount', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right" />
                    <GLAccountSelect value={d.glAccountId}
                      onChange={v => updatePayslipLine('payslipDeductions', i, 'glAccountId', v)}
                      glAccounts={glAccounts} />
                    <button type="button" onClick={() => removePayslipLine('payslipDeductions', i)}
                      className="p-1 hover:bg-accent rounded text-red-500 mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Template form dialog ───────────────────────────────────────────────────────

export function TemplateFormDialog({
  open, onClose, form, setForm, errors, setErrors, tab, setTab,
  saving, isEdit, onSave,
  contacts, accounts, categories, entities, members, locations, glAccounts,
}: {
  open: boolean
  onClose: () => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  tab: Tab
  setTab: (t: Tab) => void
  saving: boolean
  isEdit: boolean
  onSave: () => void
  contacts: ContactRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  entities: EntityRow[]
  members: MemberRow[]
  locations: LocationRow[]
  glAccounts: GLAccount[]
}) {
  const errorKeys = Object.keys(errors)
  const topErrors = errorKeys.filter(k => !k.startsWith('line_') && k !== 'balance' && k !== 'lines')

  return (
    <Drawer open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DrawerContent className="sm:max-w-[900px]" showCloseButton={true}>
        {/* Header */}
        <DrawerHeader className="px-5 pt-3 pb-0 shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            {form.kind === 'bill'
              ? <TrendingDown className="h-4 w-4 text-red-500" />
              : <TrendingUp className="h-4 w-4 text-green-600" />}
            {isEdit ? 'Edit Recurring Template' : 'New Recurring Template'}
          </DrawerTitle>
          {topErrors.length > 0 && (
            <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400 space-y-0.5">
              {topErrors.slice(0, 4).map(k => <p key={k}>{errors[k]}</p>)}
            </div>
          )}
        </DrawerHeader>

        {/* ── Narrow layout (< md): tabbed ───────────────────────── */}
        <div className="md:hidden flex flex-col flex-1 min-h-0">
          <div className="flex border-b border-border shrink-0 px-5 mt-3">
            {(['Overview', 'Frequency', 'Transaction'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'Overview' && (
              <OverviewTab
                form={form} setForm={setForm} errors={errors} isEdit={isEdit}
                contacts={contacts} accounts={accounts} categories={categories}
                entities={entities} members={members} locations={locations}
              />
            )}
            {tab === 'Frequency' && (
              <FrequencyTab form={form} setForm={setForm} errors={errors} isEdit={isEdit} />
            )}
            {tab === 'Transaction' && (
              <TransactionTab
                form={form} setForm={setForm}
                errors={errors} setErrors={setErrors}
                glAccounts={glAccounts}
              />
            )}
          </div>
        </div>

        {/* ── Wide layout (≥ md): two columns — Overview+Frequency | Transaction ── */}
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden mt-2">
          <div className="w-[38%] shrink-0 flex flex-col border-r border-border overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 border-b border-border overflow-hidden">
              <div className="px-3 py-1 border-b border-border shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Overview</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <OverviewTab
                  form={form} setForm={setForm} errors={errors} isEdit={isEdit}
                  contacts={contacts} accounts={accounts} categories={categories}
                  entities={entities} members={members} locations={locations}
                />
              </div>
            </div>
            <div className="shrink-0 flex flex-col overflow-hidden max-h-[45%]">
              <div className="px-3 py-1 border-b border-border shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Schedule</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <FrequencyTab form={form} setForm={setForm} errors={errors} isEdit={isEdit} />
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1 border-b border-border shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Transaction</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <TransactionTab
                form={form} setForm={setForm}
                errors={errors} setErrors={setErrors}
                glAccounts={glAccounts}
              />
            </div>
          </div>
        </div>

        <DrawerFooter className="px-5 pt-2.5 pb-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update Template' : 'Create Template'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
