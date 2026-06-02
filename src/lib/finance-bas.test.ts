import { describe, it, expect } from 'vitest'
import {
  computeBasFigures,
  gstCollectedContribution,
  gstItcContribution,
  incomeContribution,
  type BasGstLineInput,
  type BasIncomeLineInput,
} from '@/lib/finance-bas'

const COLLECTED = 'gst-collected-acct'
const ITC       = 'gst-itc-acct'

// These tests pin the BAS one-sided-summation bug found in the GST math audit
// (FINANCE_AUDIT.md §2). The route summed only credits on "GST Collected", only
// debits on "GST Input Tax Credits", and only credit income lines — silently
// ignoring reversal/contra lines that post on the opposite side. That overstated
// G1, 1A and 1B and broke the documented invariant that BAS agrees with the P&L.
// A reversal posts FLIPPED lines as a new posted entry, so every figure must net
// both sides.

describe('contribution helpers — both sides netted', () => {
  it('GST Collected (1A): credit adds, debit (reversal) subtracts', () => {
    expect(gstCollectedContribution('credit', 100)).toBe(100)
    expect(gstCollectedContribution('debit', 100)).toBe(-100)
  })

  it('GST ITC (1B): debit adds, credit (reversal) subtracts', () => {
    expect(gstItcContribution('debit', 50)).toBe(50)
    expect(gstItcContribution('credit', 50)).toBe(-50)
  })

  it('income: credit adds, debit (reversal/contra) subtracts', () => {
    expect(incomeContribution('credit', 200)).toBe(200)
    expect(incomeContribution('debit', 200)).toBe(-200)
  })
})

describe('computeBasFigures — forward-only baseline', () => {
  it('matches the simple one-sided case when there are no reversals', () => {
    // $1,100 GST-inc sale → $100 GST collected; $550 GST-inc purchase → $50 ITC.
    const gst: BasGstLineInput[] = [
      { glAccountId: COLLECTED, side: 'credit', amount: 100 },
      { glAccountId: ITC,       side: 'debit',  amount: 50 },
    ]
    const income: BasIncomeLineInput[] = [{ side: 'credit', amount: 1000 }]
    const f = computeBasFigures(gst, income, COLLECTED, ITC)
    expect(f.oneA).toBe(100)
    expect(f.oneB).toBe(50)
    expect(f.g1).toBe(1100)       // net income 1000 + 1A 100
    expect(f.netGst).toBe(50)     // 1A − 1B
  })
})

describe('REGRESSION: income reversal nets out of net income / G1', () => {
  it('the proven $159.91 income-debit case reduces net income, not inflates G1', () => {
    // Live data: a posted income DEBIT of $159.91 (a reversal line on
    // "Super Fund SGC - Michelle") sits alongside $639.64 of credits.
    // Old code (credits only): netIncome = 639.64. Correct (netted): 479.73.
    const income: BasIncomeLineInput[] = [
      { side: 'credit', amount: 639.64 },
      { side: 'debit',  amount: 159.91 },
    ]
    const f = computeBasFigures([], income, COLLECTED, ITC)
    expect(f.g1).toBe(479.73)     // 639.64 − 159.91, NOT 639.64
  })
})

describe('REGRESSION: GST reversals net out of 1A and 1B', () => {
  it('a reversed sale removes its GST from 1A (not double-counts it)', () => {
    // $110 sale (CR 10 GST) then fully reversed (DR 10 GST) → 1A = 0.
    const gst: BasGstLineInput[] = [
      { glAccountId: COLLECTED, side: 'credit', amount: 10 },
      { glAccountId: COLLECTED, side: 'debit',  amount: 10 },
    ]
    const f = computeBasFigures(gst, [], COLLECTED, ITC)
    expect(f.oneA).toBe(0)
    expect(f.netGst).toBe(0)
  })

  it('a reversed purchase removes its GST from 1B', () => {
    // $55 purchase (DR 5 ITC) then reversed (CR 5 ITC) → 1B = 0.
    const gst: BasGstLineInput[] = [
      { glAccountId: ITC, side: 'debit',  amount: 5 },
      { glAccountId: ITC, side: 'credit', amount: 5 },
    ]
    const f = computeBasFigures(gst, [], COLLECTED, ITC)
    expect(f.oneB).toBe(0)
  })

  it('partial reversals leave the correct net in 1A and 1B', () => {
    const gst: BasGstLineInput[] = [
      { glAccountId: COLLECTED, side: 'credit', amount: 30 },
      { glAccountId: COLLECTED, side: 'debit',  amount: 10 },  // partial reversal
      { glAccountId: ITC,       side: 'debit',  amount: 12 },
      { glAccountId: ITC,       side: 'credit', amount: 2 },   // partial reversal
    ]
    const f = computeBasFigures(gst, [], COLLECTED, ITC)
    expect(f.oneA).toBe(20)
    expect(f.oneB).toBe(10)
    expect(f.netGst).toBe(10)     // 20 − 10
  })
})

describe('rounding — float accumulation is cleaned to 2dp', () => {
  it('nets 0.1 + 0.2 to 0.30, not 0.30000000000000004', () => {
    const gst: BasGstLineInput[] = [
      { glAccountId: COLLECTED, side: 'credit', amount: 0.1 },
      { glAccountId: COLLECTED, side: 'credit', amount: 0.2 },
    ]
    const income: BasIncomeLineInput[] = [{ side: 'credit', amount: 0.1 }]
    const f = computeBasFigures(gst, income, COLLECTED, ITC)
    expect(f.oneA).toBe(0.3)              // not 0.30000000000000004
    expect(f.g1).toBe(0.4)               // r2(0.1 + 0.3)
  })
})
