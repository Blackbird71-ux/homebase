// =============================================================================
// finance-subledger.ts
//
// Pure helpers for deriving AP/AR subledger figures from posted journal lines
// rather than the nominal record amount. The two figures differ whenever a
// promoted journal carries a custom split (e.g. a salary accrual posting
// DR AR / DR PAYG / CR Gross Wages, or a bill posting CR AP + CR GST). Reading
// the control-account line keeps the subledger (aging reports, vendor/debtor
// statements) reconciled with the GL control account and the Balance Sheet.
//
// This is the §12.10 pattern, extracted so the AP/AR aging routes and the
// vendor/debtor statement compute it from one place instead of drifting copies.
// =============================================================================

export interface SubledgerJournalLine {
  glAccountId: string
  side: string
  amount: number
}

/**
 * Sum the journal lines that hit `glAccountId` on the given `side`. Returns
 * `fallback` (the nominal record amount) when the control account can't be
 * resolved or the journal has no matching lines (legacy no-journal records).
 */
export function sumControlAccountLines(
  lines: SubledgerJournalLine[] | undefined | null,
  glAccountId: string | undefined | null,
  side: 'debit' | 'credit',
  fallback: number,
): number {
  if (!glAccountId) return fallback
  const matched = (lines ?? []).filter(l => l.glAccountId === glAccountId && l.side === side)
  return matched.length > 0
    ? matched.reduce((s, l) => s + l.amount, 0)
    : fallback
}
