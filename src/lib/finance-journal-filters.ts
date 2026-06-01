// ── Shared journal-read predicate ────────────────────────────────────────────
//
// The single source of truth for "which journal entries count toward a balance
// or analytics total". A reversal is posted as its own entry (type 'reversal',
// reversalOfId set) AND the original is flagged isReversed = true. To net them to
// zero a read must EITHER include both legs (isPosted alone) OR exclude both legs.
//
// The naive `{ isPosted: true, isReversed: false }` does NEITHER: it drops the
// reversed original but KEEPS the reversal leg, leaving a phantom one-sided entry
// that skews the total (see audit Finding 13). The correct exclusion also filters
// out the reversal entry itself via `type: { not: 'reversal' }`.
//
// Use this in every balance/analytics READ of FinanceJournalEntry. Do NOT use it
// for write-path guards that find entries to reverse — those legitimately want the
// not-yet-reversed originals (`isReversed: false`) and already constrain `type`.
export const postedNonReversedWhere = {
  isPosted: true,
  isReversed: false,
  type: { not: 'reversal' },
} as const
