// Per-person tax attribution for the Tax Report's GL actuals (FINANCE_AUDIT.md §3).
//
// THE DEFECT THIS FILE FIXES: the Tax Report's per-person "Actuals" roll-up
// attributes each posted journal line to a person via memberId and detects
// PAYG/tax payments via taxClassification === 'tax_payment'. The posted journal
// lines carry NEITHER — member identity lived only in the account *name*
// (e.g. "Gross Wages - Mark") and no field distinguished PAYG accounts. So every
// person's wages/PAYG/deductions read $0 and all wage income fell into the
// "joint ÷N" bucket.
//
// THE FIX: both facts are configured once per GL account
// (FinanceCategory.memberId = owner, FinanceCategory.isTaxPayment = PAYG flag).
// The tax-report API derives each line's fields from its account through this
// single helper, so the route and its regression test cannot diverge.

export interface GlAccountTaxConfig {
  memberId:     string | null
  isTaxPayment: boolean
}

export interface GlLineTaxFields {
  memberId:          string | null
  taxClassification: string | null   // 'tax_payment' when the account is flagged, else null
}

/**
 * Derive a tax-report line's owner + classification from its GL account.
 *   memberId          ← account owner (null = shared/joint)
 *   taxClassification ← 'tax_payment' iff the account is flagged isTaxPayment
 */
export function deriveGlActualTaxFields(acct: GlAccountTaxConfig): GlLineTaxFields {
  return {
    memberId:          acct.memberId ?? null,
    taxClassification: acct.isTaxPayment ? 'tax_payment' : null,
  }
}
