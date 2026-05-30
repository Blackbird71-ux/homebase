// ── Shared recurrence stepping core ──────────────────────────────────────────
// Pure, client-safe date math shared by the server template service
// (computeNextOccurrenceDate in finance-recurring-template-service.ts) and the
// client preview utils (nextOccurrence in finance-recurrence-utils.ts).
//
// This module imports only date-fns — no prisma, node:crypto or audit-log — so
// it is safe to import from 'use client' code. It is the single source of truth
// for occurrence stepping so the server and client can never drift apart.
//
// Server semantics win: for yearly templates with a monthOfYear set, the day is
// reset to the 1st before any dayOfMonth snap (so "every year in March" with no
// explicit day lands on the 1st, not on whatever day the stepped date happened
// to carry).

import { addDays, addWeeks, addMonths, setDate, getDaysInMonth } from 'date-fns'

// ── applyDayOfMonth ──────────────────────────────────────────────────────────
// Snap a date to `targetDay` (1–31), clamping to the month's actual max day so
// e.g. day 31 in February lands on the 28th/29th. Pure — input is not mutated.
//
//   applyDayOfMonth(new Date(2026, 1, 10), 31)  // Feb 10 → Feb 28 (29 in leap)
//   applyDayOfMonth(new Date(2026, 0, 15), 31)  // Jan 15 → Jan 31
//   applyDayOfMonth(new Date(2026, 0, 15), 5)   // Jan 15 → Jan 5
export function applyDayOfMonth(d: Date, targetDay: number): Date {
  const maxDay = getDaysInMonth(d)
  const day = Math.min(Math.max(1, targetDay), maxDay)
  return setDate(d, day)
}

// ── stepOccurrence ───────────────────────────────────────────────────────────
// Step one occurrence forward from `from` for the given frequency, then snap to
// dayOfMonth / monthOfYear where the frequency supports it (monthly families and
// yearly only — weekly/fortnightly/custom never snap).
//
// Returns null only for an unrecognised frequency; callers decide how to handle
// that (the server logs and treats null as "skip template"; the client falls
// back to a monthly step to preserve its prior behaviour).
export function stepOccurrence(
  from: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
): Date | null {
  const snap = (d: Date): Date => (dayOfMonth != null ? applyDayOfMonth(d, dayOfMonth) : d)

  switch (freq) {
    case 'weekly':      return addWeeks(from, 1 * interval)
    case 'fortnightly': return addWeeks(from, 2 * interval)
    case 'monthly':     return snap(addMonths(from, 1 * interval))
    case 'bimonthly':   return snap(addMonths(from, 2 * interval))
    case 'quarterly':   return snap(addMonths(from, 3 * interval))
    case 'halfyearly':  return snap(addMonths(from, 6 * interval))
    case 'yearly': {
      let next = addMonths(from, 12 * interval)
      if (monthOfYear != null) {
        // monthOfYear is 1-12 (calendar). Reset to the 1st of that month; the
        // snap below then places the day if dayOfMonth is set.
        const jsMonth = Math.max(0, Math.min(11, monthOfYear - 1))
        next = new Date(next.getFullYear(), jsMonth, 1)
      }
      return snap(next)
    }
    case 'custom':      return addDays(from, interval) // interval = day count
    default:            return null
  }
}
