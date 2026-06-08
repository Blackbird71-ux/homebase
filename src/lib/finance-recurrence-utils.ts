// ── Client-safe occurrence preview utilities ─────────────────────────────────
// Pure date-math functions shared between the templates page and any future
// client-side preview needs. These do NOT access prisma or node:crypto and are
// safe to import from 'use client' code.
//
// The actual stepping math now lives in finance-recurrence-core (also used by
// the server's computeNextOccurrenceDate) so the client preview and the spawn
// worker can never drift apart. This file keeps the flat-parameter signatures
// the templates UI already depends on.

import { addUtcMonths } from '@/lib/timezone'
import { applyDayOfMonth, stepOccurrence } from '@/lib/finance-recurrence-core'

export { applyDayOfMonth }

// ── nextOccurrence ───────────────────────────────────────────────────────────
// Compute the next occurrence date from `from` given a frequency config.
// This is the client-side equivalent of computeNextOccurrenceDate, using
// flat parameters instead of an OccurrenceTemplate object. Delegates to the
// shared core; an unknown frequency falls back to a monthly step (preserving
// this function's long-standing default-case behaviour).

export function nextOccurrence(
  from: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
): Date {
  return stepOccurrence(from, freq, interval, dayOfMonth, monthOfYear) ?? addUtcMonths(from, interval)
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
