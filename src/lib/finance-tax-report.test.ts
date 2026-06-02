import { describe, it, expect } from 'vitest'
import { deriveGlActualTaxFields } from '@/lib/finance-tax-report'

// Pins the per-person attribution bug found in the payslip audit
// (FINANCE_AUDIT.md §3). The tax-report API previously emitted no memberId and
// no taxClassification on its GL actuals, so the page's per-person roll-up
// (filter by l.memberId; detect l.taxClassification === 'tax_payment') saw
// nothing: every person's wages/PAYG read $0 and all income fell into the
// "joint ÷N" bucket. The fields are now derived from the line's GL account.

describe('deriveGlActualTaxFields — per-person tax attribution (FINANCE_AUDIT §3)', () => {
  it('passes the account owner through as the line memberId', () => {
    expect(deriveGlActualTaxFields({ memberId: 'mark', isTaxPayment: false }).memberId).toBe('mark')
  })

  it('treats a null owner as a shared / joint line', () => {
    expect(deriveGlActualTaxFields({ memberId: null, isTaxPayment: false }).memberId).toBeNull()
  })

  it('classifies a flagged tax-payment account line as tax_payment (PAYG)', () => {
    expect(deriveGlActualTaxFields({ memberId: 'michelle', isTaxPayment: true }).taxClassification).toBe('tax_payment')
  })

  it('leaves a non-tax-payment line unclassified', () => {
    expect(deriveGlActualTaxFields({ memberId: 'michelle', isTaxPayment: false }).taxClassification).toBeNull()
  })

  it('a tax-payment account still carries its owner (PAYG is attributed per person)', () => {
    const f = deriveGlActualTaxFields({ memberId: 'mark', isTaxPayment: true })
    expect(f).toEqual({ memberId: 'mark', taxClassification: 'tax_payment' })
  })
})
