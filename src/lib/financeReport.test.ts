import { describe, it, expect } from 'vitest'
import { aggregateEntitySection } from '@/lib/financeReport'

// Pins the consolidation bug found in the multi-entity export audit
// (FINANCE_AUDIT.md §4). The export (buildYtdReport) previously filtered income
// rows with `d.total > 0` and expense rows/categories with `> 0` / `<= 0`, which
// DROPPED any net-negative row. A posted reversal that lands on an income account
// nets negative — so it vanished from the export while the on-screen P&L
// (pnl/route.ts, `totalPeriod !== 0`) still counted it. Result: the export
// overstated income and NETT relative to what users saw on screen.
//
// These tests assert net-negative rows are KEPT (so export math == P&L math) and
// only exactly-zero rows are dropped.

const FY = 2025
const FY_START = 7        // July
const TZ = 'Australia/Sydney'
const MONTHS = 12
// 2026-05-22 (a date inside FY 2025-26) — index 10 (May) of a July-start FY.
const inFY = new Date('2026-05-22T03:00:00.000Z')

function incomeLine(name: string, side: 'credit' | 'debit', amount: number, description = 'x') {
  return { side, amount, glAccount: { name, type: 'income' }, journalEntry: { date: inFY, description } }
}
function expenseLine(name: string, side: 'debit' | 'credit', amount: number, description = 'x') {
  return { side, amount, glAccount: { name, type: 'expense' }, journalEntry: { date: inFY, description } }
}

describe('aggregateEntitySection — net-negative rows survive (FINANCE_AUDIT §4)', () => {
  it('KEEPS a net-negative income account (a posted reversal) instead of dropping it', () => {
    // A reversal debits an income account: net = -159.91.
    const s = aggregateEntitySection(
      [incomeLine('Super Fund SGC - Michelle', 'debit', 159.91)],
      'Personal', null, FY, FY_START, TZ, MONTHS,
    )
    expect(s.income.rows).toHaveLength(1)
    expect(s.income.subtotal).toBe(-159.91)
    expect(s.nett).toBe(-159.91)
  })

  it('an income account that nets to exactly zero (accrual + its reversal) is dropped', () => {
    const s = aggregateEntitySection(
      [incomeLine('SGC', 'credit', 159.91), incomeLine('SGC', 'debit', 159.91)],
      'Super Fund', 'e1', FY, FY_START, TZ, MONTHS,
    )
    expect(s.income.rows).toHaveLength(0)
    expect(s.income.subtotal).toBe(0)
  })

  it('KEEPS an expense category whose rows net negative (VOID reversal > original)', () => {
    // Original expense (debit, +100) and an over-reversal (credit, 160) under
    // DIFFERENT descriptions — previously the negative VOID row was dropped and
    // the +100 stayed, overstating expense. Now both survive and net to -60.
    const s = aggregateEntitySection(
      [
        expenseLine('Fuel', 'debit', 100, 'Apco Fuel'),
        expenseLine('Fuel', 'credit', 160, 'VOID: JE-1 — Apco Fuel'),
      ],
      'Personal', null, FY, FY_START, TZ, MONTHS,
    )
    const fuel = s.expenses.categories.find(c => c.name === 'Fuel')
    expect(fuel).toBeDefined()
    expect(fuel!.subtotal).toBe(-60)
    expect(s.expenses.subtotal).toBe(-60)
  })

  it('an expense category that nets to exactly zero (full VOID) is dropped', () => {
    const s = aggregateEntitySection(
      [
        expenseLine('Fuel', 'debit', 74.18, 'Apco Fuel'),
        expenseLine('Fuel', 'credit', 74.18, 'VOID: JE-1 — Apco Fuel'),
      ],
      'Personal', null, FY, FY_START, TZ, MONTHS,
    )
    expect(s.expenses.categories).toHaveLength(0)
    expect(s.expenses.subtotal).toBe(0)
  })

  it('section subtotals equal the P&L-style account net (income − expense)', () => {
    const s = aggregateEntitySection(
      [
        incomeLine('Wages', 'credit', 1000),
        incomeLine('Super Fund SGC - Michelle', 'debit', 159.91), // net-negative reversal
        expenseLine('Fuel', 'debit', 100, 'Apco Fuel'),
      ],
      'Personal / Family', 'e1', FY, FY_START, TZ, MONTHS,
    )
    expect(s.income.subtotal).toBe(840.09)   // 1000 − 159.91 (P&L would show the same)
    expect(s.expenses.subtotal).toBe(100)
    expect(s.nett).toBe(740.09)
  })
})
