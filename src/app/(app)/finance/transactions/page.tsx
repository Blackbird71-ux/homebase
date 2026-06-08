'use client'

import { Plus, Pencil, Trash2, Filter, X, Receipt, CheckCircle } from 'lucide-react'
import { formatInTz } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/shared/PageHero'
import { sortedCategoryList } from '@/lib/finance-categories'
import { formatCurrency } from '@/lib/financeShared'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
import { useTransactionCrud, type Transaction } from '@/hooks/finance/useTransactionCrud'

export type { Transaction } from '@/hooks/finance/useTransactionCrud'

export default function TransactionsPage() {
  const {
    transactions, loading, showForm, editing,
    form, setForm, errors,
    fetchError,
    accounts, categories, members, locations, entities,
    page, setPage, total, totalPages,
    filterType, setFilterType,
    filterMemberId, setFilterMemberId,
    filterLocationId, setFilterLocationId,
    filterEntityId, setFilterEntityId,
    showFilters, setShowFilters,
    load, openNew, openEdit, closeForm, handleSave, handleDelete, handleClear,
  } = useTransactionCrud()

  if (loading && transactions.length === 0) return <div className="p-4 text-muted-foreground">Loading transactions…</div>

  return (
    <div className="space-y-4">
      <PageHero title="Transactions" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            (filterMemberId || filterLocationId || filterType || filterEntityId)
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground')}>
          <Filter className="h-3.5 w-3.5" /> Filters
          {(filterMemberId || filterLocationId || filterType || filterEntityId) && <span className="w-1.5 h-1.5 rounded-full bg-primary ml-0.5" />}
        </button>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Transaction
        </button>
      </div>

      {showFilters && (
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filters</span>
            <button onClick={() => { setFilterMemberId(''); setFilterLocationId(''); setFilterType(''); setFilterEntityId(''); setPage(1) }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">All types</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="opening_balance">Opening Balance</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Member</label>
              <select value={filterMemberId} onChange={e => { setFilterMemberId(e.target.value); setPage(1) }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">All members</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Location</label>
              <select value={filterLocationId} onChange={e => { setFilterLocationId(e.target.value); setPage(1) }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">All locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entity</label>
              <select value={filterEntityId} onChange={e => { setFilterEntityId(e.target.value); setPage(1) }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">All entities</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <Drawer open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DrawerContent className="sm:max-w-[720px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>{editing ? 'Edit Transaction' : 'New Transaction'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {Object.keys(errors).length > 0 && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 mb-3">
                <p className="text-xs text-red-500 font-medium">Please fix the following errors:</p>
                <ul className="list-disc list-inside text-xs text-red-500/80 mt-1">
                  {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value, taxClassification: '' }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Amount *</label>
                <input type="number" step="0.01" value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                  className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.amount ? 'border-red-500 ring-1 ring-red-500' : 'border-input')} />
                {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payee</label>
                <input value={form.payee} onChange={e => setForm(p => ({ ...p, payee: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Account</label>
                <select value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">Uncategorized</option>
                  {sortedCategoryList(categories.filter(c => c.type === form.type)).map(c => (
                    <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">GL Account (cash/asset side)</label>
                <select value={form.glAccountId} onChange={e => setForm(p => ({ ...p, glAccountId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No GL account (no journal entry)</option>
                  {sortedCategoryList(categories.filter(c => ['asset','liability'].includes(c.type))).map(c => (
                    <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-0.5">Required for GL entry. Select bank account, term deposit, property, etc.</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Member</label>
                <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No member</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Location</label>
                <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Entity</label>
                <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No entity</option>
                  {entities.map(en => <option key={en.id} value={en.id}>{en.name}{en.isDefault ? ' (default)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Receipt className="h-3 w-3 text-amber-500" /> Tax Classification
                </label>
                <select value={form.taxClassification} onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">Not classified</option>
                  {(form.type === 'expense' || form.type === 'transfer') && (
                    <>
                      <option value="tax_deduction">Tax Deduction (ATO deductible)</option>
                      <option value="tax_payment">Tax Payment (PAYG, BAS)</option>
                    </>
                  )}
                  {form.type === 'income' && (
                    <>
                      <option value="taxable_income">Taxable Income</option>
                      <option value="exempt_income">Exempt Income</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.isCleared} onChange={e => setForm(p => ({ ...p, isCleared: e.target.checked }))} />
                  Cleared
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.isPrivate} onChange={e => setForm(p => ({ ...p, isPrivate: e.target.checked }))} />
                  Private
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.isTransfer} onChange={e => setForm(p => ({ ...p, isTransfer: e.target.checked }))} />
                  Transfer
                </label>
              </div>
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <button onClick={closeForm} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {fetchError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center space-y-3">
          <p className="text-sm text-red-500">{fetchError}</p>
          <button onClick={load}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-background border border-input rounded-md px-3 py-1.5 hover:bg-accent">
            Retry
          </button>
        </div>
      )}

      {!fetchError && transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions found.</p>
      ) : (
        <div className="space-y-2">
          {transactions.map(t => {
            const isOpeningBalance = t.type === 'opening_balance'
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 cursor-default"
                onDoubleClick={() => openEdit(t)}>
                {/* Type icon — opening_balance gets its own colour */}
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                  isOpeningBalance          ? 'bg-purple-500/10 text-purple-500' :
                  t.type === 'income'       ? 'bg-green-500/10  text-green-500' :
                  t.type === 'transfer'     ? 'bg-blue-500/10   text-blue-500'  :
                                              'bg-red-500/10    text-red-500')}>
                  {isOpeningBalance ? '⚖' : t.type === 'income' ? '+' : t.type === 'transfer' ? '↔' : '-'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{t.payee ?? t.description ?? 'Transaction'}</span>
                    {!t.isCleared    && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-1.5 rounded">PENDING</span>}
                    {t.isPrivate     && <span className="text-xs bg-muted px-1.5 rounded">PRIVATE</span>}
                    {t.isTransfer    && <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 rounded">TRANSFER</span>}
                    {/* Spec §6.4: show "Opening Balance" badge instead of normal type badge */}
                    {isOpeningBalance && (
                      <span className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-medium">
                        OPENING BALANCE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {t.category && <span>{t.category.name}</span>}
                    {t.account  && <span>{t.account.name}</span>}
                    {t.member   && <span>{t.member.name}</span>}
                    {t.location && <span>{t.location.name}</span>}
                    {t.entity && !t.entity.isDefault && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: t.entity.color ? `${t.entity.color}20` : undefined, color: t.entity.color ?? undefined }}>
                        {t.entity.name}
                      </span>
                    )}
                    <span>{formatInTz(new Date(t.date), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                <p className={cn('text-sm font-semibold shrink-0',
                  isOpeningBalance      ? 'text-purple-500' :
                  t.type === 'income'   ? 'text-green-500'  :
                  t.type === 'transfer' ? 'text-blue-500'   :
                                          'text-red-500')}>
                  {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                </p>

                {/* Opening balance rows are read-only; other rows allow edit/delete */}
                {!isOpeningBalance ? (
                  <>
                    {!t.isCleared && (
                      <button onClick={() => handleClear(t.id)} title="Clear transaction"
                        className="p-1 hover:bg-accent rounded text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => openEdit(t)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/60 italic px-2">via Accounts</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  )
}
