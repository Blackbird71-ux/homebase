// ── Shared interfaces & constants for the journals page ──────────────────────

export interface GLAccount {
  id: string
  name: string
  type: string
  glCode: string | null
  parentId: string | null
  isSystem: boolean
}

export interface Entity {
  id: string
  name: string
  color: string | null
  isDefault: boolean
}

export interface JournalLine {
  id: string
  glAccountId: string
  glAccount: { id: string; name: string; type: string; glCode: string | null } | null
  side: 'debit' | 'credit'
  amount: number
  description: string | null
  memberId: string | null
}

export interface JournalEntry {
  id: string
  date: string
  reference: string | null
  description: string
  type: string
  isPosted: boolean
  isReversed: boolean
  reversalOfId: string | null
  amendmentOfId: string | null
  // The corrective entry that amended this one — populated when isReversed=true and an amendment exists
  amendments: { id: string; reference: string | null }[]
  lines: JournalLine[]
  entity: { id: string; name: string; color: string | null } | null
  entityId: string | null
  createdAt: string
}

export interface FormLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: string
  description: string
}

export interface JournalForm {
  date: string
  description: string
  type: string
  entityId: string
  lines: FormLine[]
}

export interface ReversalState {
  entry: JournalEntry
  date: string
  description: string
}

export interface AmendmentState {
  entry: JournalEntry
  correctionDate: string
}

export const TYPE_LABELS: Record<string, string> = {
  manual:           'Manual',
  opening_balance:  'Opening Balance',
  adjustment:       'Adjustment',
  reversal:         'Reversal',
  auto_transaction: 'Auto (Transaction)',
}

export const MANUAL_TYPES = [
  { value: 'manual',     label: 'Manual journal entry' },
  { value: 'adjustment', label: 'Adjustment / correction' },
]

export function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export function normalSide(type: string): 'debit' | 'credit' {
  return (type === 'asset' || type === 'expense') ? 'debit' : 'credit'
}

export function emptyForm(todayDate: string): JournalForm {
  return {
    date: todayDate,
    description: '',
    type: 'manual',
    entityId: '',
    lines: [
      { glAccountId: '', side: 'debit',  amount: '', description: '' },
      { glAccountId: '', side: 'credit', amount: '', description: '' },
    ],
  }
}
