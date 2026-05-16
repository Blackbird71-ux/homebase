// ── Client-safe occurrence preview utilities ─────────────────────────────────
// Pure date-math functions shared between the templates page and any future
// client-side preview needs. These do NOT access prisma or node:crypto and are
// safe to import from 'use client' code.
//
// The server-side equivalents in finance-recurring-template-service.ts use a
// different (object-based) signature and are kept separate to avoid regression.

import { addDays, addWeeks, addMonths, setDate, getDaysInMonth } from 'date-fns'

// ── applyDayOfMonth ──────────────────────────────────────────────────────────
// Snap a date to `targetDay` (1–31), clamping to the month's actual max day.
// This is a pure function — input date is not mutated.

export function applyDayOfMonth(d: Date, targetDay: number): Date {
  const max = getDaysInMonth(d)
  return setDate(d, Math.min(Math.max(1, targetDay), max))
}

// ── nextOccurrence ───────────────────────────────────────────────────────────
// Compute the next occurrence date from `from` given a frequency config.
// This is the client-side equivalent of computeNextOccurrenceDate, using
// flat parameters instead of an OccurrenceTemplate object.

export function nextOccurrence(
  from: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
): Date {
  let next: Date
  switch (freq) {
    case 'weekly':      next = addWeeks(from, interval); break
    case 'fortnightly': next = addWeeks(from, 2 * interval); break
    case 'monthly':     next = addMonths(from, interval); break
    case 'bimonthly':   next = addMonths(from, 2 * interval); break
    case 'quarterly':   next = addMonths(from, 3 * interval); break
    case 'halfyearly':  next = addMonths(from, 6 * interval); break
    case 'yearly':      next = addMonths(from, 12 * interval); break
    case 'custom':      next = addDays(from, interval); break
    default:            next = addMonths(from, interval)
  }
  const snapFreqs = ['monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly']
  if (dayOfMonth && snapFreqs.includes(freq)) {
    next = applyDayOfMonth(next, dayOfMonth)
  }
  if (monthOfYear && freq === 'yearly') {
    next = new Date(next.getFullYear(), monthOfYear - 1, next.getDate())
    if (dayOfMonth) next = applyDayOfMonth(next, dayOfMonth)
  }
  return next
}

// ── previewOccurrences ───────────────────────────────────────────────────────
// Generate up to `count` occurrence dates starting from `startDate`.
// Respects endMode ('forever' | 'until' | 'for_n_occurrences').

export function previewOccurrences(
  startDate: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
  endMode: string,
  endDate: Date | null,
  totalOccurrences: number | null,
  count: number,
): Date[] {
  const cap = endMode === 'for_n_occurrences' && totalOccurrences
    ? Math.min(count, totalOccurrences)
    : count
  const result: Date[] = []
  let cur = startDate
  while (result.length < cap) {
    if (endMode === 'until' && endDate && cur > endDate) break
    result.push(cur)
    if (result.length < cap) {
      cur = nextOccurrence(cur, freq, interval, dayOfMonth, monthOfYear)
    }
  }
  return result
}
