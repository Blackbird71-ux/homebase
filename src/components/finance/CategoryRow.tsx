'use client'

import { ChevronDown, ChevronRight, BookOpen, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Category } from './CategoryDialog'
import { formatCurrency } from '@/lib/financeShared'

export type FilterType = 'all' | 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'transfer'

export const FILTER_OPTIONS: { value: FilterType; label: string; color: string }[] = [
  { value: 'all',       label: 'All',          color: 'text-foreground border-border' },
  { value: 'asset',     label: 'Assets',       color: 'text-purple-600 dark:text-purple-400 border-purple-500/40 bg-purple-500/10' },
  { value: 'liability', label: 'Liabilities',  color: 'text-orange-600 dark:text-orange-400 border-orange-500/40 bg-orange-500/10' },
  { value: 'equity',    label: 'Equity',       color: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
  { value: 'income',    label: 'Income',       color: 'text-green-600 dark:text-green-400 border-green-500/40 bg-green-500/10' },
  { value: 'expense',   label: 'Expenses',     color: 'text-red-600 dark:text-red-400 border-red-500/40 bg-red-500/10' },
  { value: 'transfer',  label: 'Transfer',     color: 'text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-500/10' },
]

export const NOT_IN_USE_NAME = 'Not In Use'

const TYPE_COLORS: Record<string, string> = {
  income:    'text-green-500 bg-green-500/10',
  expense:   'text-red-500 bg-red-500/10',
  transfer:  'text-blue-500 bg-blue-500/10',
  asset:     'text-purple-500 bg-purple-500/10',
  liability: 'text-orange-500 bg-orange-500/10',
  equity:    'text-cyan-500 bg-cyan-500/10',
}

function TypeBadge({ type }: { type: string }) {
  return <span className={cn('text-xs px-2 py-0.5 rounded-full', TYPE_COLORS[type] ?? TYPE_COLORS.expense)}>{type}</span>
}

interface Props {
  cat: Category
  childrenMap: Map<string, Category[]>
  depth: number
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  showToggle?: boolean
  onSetOpeningBalance: (c: Category) => void
  onOpenLedger: (c: Category) => void
  activeFilter: FilterType
}

export function CategoryRow({
  cat, childrenMap, depth, onEdit, onDelete,
  isCollapsed, onToggleCollapse, showToggle,
  onSetOpeningBalance, onOpenLedger, activeFilter,
}: Props) {
  const children = (childrenMap.get(cat.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name))
  const hasChildren = children.length > 0

  const flags: string[] = []
  if (cat.isTaxDeduction)        flags.push('TAX DED')
  if (cat.taxIncludeInReporting) flags.push('TAX RPT')
  if (cat.gstApplicable)         flags.push(`GST ${cat.gstRate ?? 10}%`)
  if (cat.isPersonal)            flags.push('PRIVATE')
  if (cat.isLocationBased)       flags.push('LOCATION')
  if (cat.isExternal)            flags.push('EXTERNAL')
  if (cat.hideFromReports)       flags.push('HIDDEN')

  function hasMatchingDescendant(c: Category): boolean {
    if (activeFilter === 'all' || c.type === activeFilter) return true
    return (childrenMap.get(c.id) ?? []).some(k => hasMatchingDescendant(k))
  }

  if (!hasMatchingDescendant(cat)) return null

  const effectivelyCollapsed = activeFilter !== 'all' ? false : (isCollapsed ?? false)

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors',
          cat.name === NOT_IN_USE_NAME && 'border-dashed border-muted-foreground/30',
          activeFilter !== 'all' && cat.type !== activeFilter && 'opacity-50',
        )}
        style={{ marginLeft: depth * 24 }}
        onDoubleClick={() => onEdit(cat)}
      >
        {showToggle && hasChildren ? (
          <button onClick={onToggleCollapse} className="p-0.5 hover:bg-accent rounded shrink-0"
            title={isCollapsed ? 'Show subcategories' : 'Hide subcategories'}>
            {effectivelyCollapsed
              ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown  className="h-4 w-4 text-muted-foreground" />}
          </button>
        ) : (
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6B7280' }} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {cat.glCode && (
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{cat.glCode}</span>
            )}
            <span className="text-sm font-medium">{cat.name}</span>
            {cat.isSystem && <span className="text-xs bg-muted px-1.5 rounded">SYSTEM</span>}
            {flags.map(f => (
              <span key={f} className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium border',
                f === 'TAX DED' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' :
                f === 'TAX RPT' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' :
                'bg-muted text-muted-foreground border-border'
              )}>{f}</span>
            ))}
            {showToggle && effectivelyCollapsed && hasChildren && (
              <span className="text-xs text-muted-foreground">
                {children.length} subcategor{children.length === 1 ? 'y' : 'ies'} (hidden)
              </span>
            )}
          </div>
          {cat._count && (cat._count.transactions + cat._count.recurringBills + cat._count.incomeEntries) > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                cat._count.transactions   > 0 && `${cat._count.transactions} txn${cat._count.transactions !== 1 ? 's' : ''}`,
                cat._count.recurringBills > 0 && `${cat._count.recurringBills} bill${cat._count.recurringBills !== 1 ? 's' : ''}`,
                cat._count.incomeEntries  > 0 && `${cat._count.incomeEntries} income`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <TypeBadge type={cat.type} />

        <div className="flex items-center gap-1">
          <button onClick={() => onOpenLedger(cat)} title="View account ledger"
            className="flex items-center gap-1 p-1 px-2 hover:bg-accent rounded text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="h-3.5 w-3.5" /> Ledger
          </button>
          <button onClick={() => onEdit(cat)} className="p-1 hover:bg-accent rounded">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {(cat.type === 'asset' || cat.type === 'liability' || cat.type === 'equity') && !cat.isSystem && (
            <button onClick={() => onSetOpeningBalance(cat)} title="Set opening balance"
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                cat.openingBalance != null
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'text-muted-foreground border-border hover:border-primary hover:text-primary'
              )}>
              {cat.openingBalance != null
                ? `OB: ${formatCurrency(cat.openingBalance, { maximumFractionDigits: 0 })}`
                : 'Set OB'}
            </button>
          )}
          {!cat.isSystem && (
            <button onClick={() => onDelete(cat.id)} className="p-1 hover:bg-accent rounded text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasChildren && !effectivelyCollapsed && children.map(child => (
        <CategoryRow key={child.id} cat={child} childrenMap={childrenMap} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete}
          onSetOpeningBalance={onSetOpeningBalance}
          onOpenLedger={onOpenLedger}
          activeFilter={activeFilter} />
      ))}
    </>
  )
}
