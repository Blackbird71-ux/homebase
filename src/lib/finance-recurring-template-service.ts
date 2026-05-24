// =============================================================================
// finance-recurring-template-service.ts — pure helpers (Chunk A)
//
// Date math, occurrence preview, and snapshot hashing for repeating-transaction
// templates. NO Prisma writes in this chunk — CRUD lives in Chunk B.
//
// Decision A1 (locked): startDate IS the first occurrence date. Subsequent
//   occurrences honour dayOfMonth/monthOfYear if set; otherwise they step by
//   the raw period from the previous occurrence date.
//
// Decision A2 (locked): for monthly templates with dayOfMonth > days_in_month
//   (e.g. day 31 in a 30-day month), the occurrence snaps to the last day of
//   the month. This matches Xero behaviour and what date-fns addMonths does
//   natively for end-of-month dates.
// =============================================================================

import { createHash } from 'node:crypto'
import { addDays, addMonths, addWeeks, getDaysInMonth, setDate } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit-log'
import type { SessionUser } from '@/types'

// ── Literal types matching the schema string columns ────────────────────────
// These are NOT enums — the DB stores them as TEXT. The types here are for
// compile-time safety only; runtime values must be validated against the
// strings below before being stored.

export type TemplateKind = 'bill' | 'income'

export type Frequency =
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'halfyearly'
  | 'yearly'
  | 'custom'

export type EndMode =
  | 'forever'
  | 'until'
  | 'for_n_occurrences'

export const KNOWN_FREQUENCIES: readonly Frequency[] = [
  'weekly', 'fortnightly', 'monthly', 'bimonthly',
  'quarterly', 'halfyearly', 'yearly', 'custom',
] as const

export const KNOWN_END_MODES: readonly EndMode[] = [
  'forever', 'until', 'for_n_occurrences',
] as const

export const KNOWN_KINDS: readonly TemplateKind[] = ['bill', 'income'] as const

// ── Minimum field set required for date math ────────────────────────────────
// Both computeNextOccurrenceDate and previewOccurrences accept this subset
// of FinanceRecurringTemplate fields. Callers can pass the full Prisma row
// or just the relevant fields — useful for previewing before insert.
export interface OccurrenceTemplate {
  frequency: string
  interval: number
  dayOfMonth: number | null
  monthOfYear: number | null
  startDate: Date
  endMode: string
  endDate: Date | null
  totalOccurrences: number | null
  occurrencesRemaining: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// applyDayOfMonth
//
// Snap a date to a target day-of-month within the SAME month, capping at
// the last day if the target exceeds days_in_month (Decision A2).
//
// Example:
//   applyDayOfMonth(new Date(2026, 1, 10), 31)  // Feb 10 → Feb 28 (or 29 in leap)
//   applyDayOfMonth(new Date(2026, 0, 15), 31)  // Jan 15 → Jan 31
//   applyDayOfMonth(new Date(2026, 0, 15), 5)   // Jan 15 → Jan 5
//
// This is a pure function — input date is not mutated.
// ─────────────────────────────────────────────────────────────────────────────
function applyDayOfMonth(d: Date, targetDay: number): Date {
  const maxDay = getDaysInMonth(d)
  const day = Math.min(Math.max(1, targetDay), maxDay)
  return setDate(d, day)
}

// ─────────────────────────────────────────────────────────────────────────────
// computeNextOccurrenceDate
//
// Given a template and a "from" date (typically the most-recently-spawned
// occurrence, or startDate if nothing has spawned yet), return the date of
// the NEXT occurrence after that — or null if the template has ended.
//
// Algorithm per Decision A1:
//   - The template's startDate IS the first occurrence; this function never
//     returns startDate itself. Callers wanting "what's the first occurrence?"
//     should just read template.startDate directly.
//   - For each subsequent occurrence: step `interval` periods forward from
//     `fromDate` based on `frequency`, then snap to dayOfMonth/monthOfYear
//     if those are configured (monthly/yearly families only).
//   - If endMode='until' and result > endDate, return null.
//   - If endMode='for_n_occurrences' and occurrencesRemaining <= 0, return null.
//     (Callers must decrement occurrencesRemaining themselves after spawning;
//     this function reads but does not write.)
//
// Frequency mappings:
//   weekly       → addWeeks(date, 1 * interval)
//   fortnightly  → addWeeks(date, 2 * interval)
//   monthly      → addMonths(date, 1 * interval) + optional dayOfMonth snap
//   bimonthly    → addMonths(date, 2 * interval) + optional dayOfMonth snap
//   quarterly    → addMonths(date, 3 * interval) + optional dayOfMonth snap
//   halfyearly   → addMonths(date, 6 * interval) + optional dayOfMonth snap
//   yearly       → addMonths(date, 12 * interval) + dayOfMonth + monthOfYear snap
//   custom       → addDays(date, interval)   [interval = day count]
//
// Note on monthOfYear:
//   For yearly templates, monthOfYear (1-12) sets the target month. Combined
//   with dayOfMonth this lets users say "every year on March 15". When
//   omitted, the month/day from `fromDate` is used.
// ─────────────────────────────────────────────────────────────────────────────
export function computeNextOccurrenceDate(
  template: OccurrenceTemplate,
  fromDate: Date,
): Date | null {
  const { frequency, interval, dayOfMonth, monthOfYear, endMode, endDate, occurrencesRemaining } = template

  // Guards: template already ended by count?
  if (endMode === 'for_n_occurrences' && (occurrencesRemaining ?? 0) <= 0) {
    return null
  }

  // Step forward based on frequency
  let next: Date
  switch (frequency) {
    case 'weekly':
      next = addWeeks(fromDate, 1 * interval)
      break
    case 'fortnightly':
      next = addWeeks(fromDate, 2 * interval)
      break
    case 'monthly':
      next = addMonths(fromDate, 1 * interval)
      if (dayOfMonth != null) next = applyDayOfMonth(next, dayOfMonth)
      break
    case 'bimonthly':
      next = addMonths(fromDate, 2 * interval)
      if (dayOfMonth != null) next = applyDayOfMonth(next, dayOfMonth)
      break
    case 'quarterly':
      next = addMonths(fromDate, 3 * interval)
      if (dayOfMonth != null) next = applyDayOfMonth(next, dayOfMonth)
      break
    case 'halfyearly':
      next = addMonths(fromDate, 6 * interval)
      if (dayOfMonth != null) next = applyDayOfMonth(next, dayOfMonth)
      break
    case 'yearly': {
      next = addMonths(fromDate, 12 * interval)
      // monthOfYear is 1-12 (calendar). Convert to JS month index (0-11) for setMonth.
      if (monthOfYear != null) {
        const jsMonth = Math.max(0, Math.min(11, monthOfYear - 1))
        next = new Date(next.getFullYear(), jsMonth, 1)
        // setMonth would normalise out-of-range days; using a fresh Date is safer.
      }
      if (dayOfMonth != null) next = applyDayOfMonth(next, dayOfMonth)
      break
    }
    case 'custom':
      // interval is treated as day count for custom frequencies
      next = addDays(fromDate, interval)
      break
    default:
      // Unknown frequency — fail loudly. The spawn worker treats null as
      // "skip this template"; the template service's validator should have
      // caught this during create/update so reaching here implies a bug
      // or data corruption.
      console.warn(`[computeNextOccurrenceDate] Unknown frequency "${frequency}" — returning null`)
      return null
  }

  // Cap at endDate if endMode='until'
  if (endMode === 'until' && endDate != null && next > endDate) {
    return null
  }

  return next
}

// ─────────────────────────────────────────────────────────────────────────────
// previewOccurrences
//
// Returns the next N occurrence dates after the template's startDate
// (INCLUDING startDate as occurrence #1). Used by the template-editor UI to
// show users a sample of when drafts will appear.
//
// This function does not consult lastSpawnedDate — it always projects from
// startDate. For "what will spawn next from the live cursor?", call
// computeNextOccurrenceDate(template, template.lastSpawnedDate ?? template.startDate).
//
// Returns at most `count` dates. Stops early if the template ends within the
// preview window (endMode='until' with endDate, or endMode='for_n_occurrences'
// with totalOccurrences < count).
// ─────────────────────────────────────────────────────────────────────────────
export function previewOccurrences(
  template: OccurrenceTemplate,
  count: number,
): Date[] {
  if (count <= 0) return []
  // Cap N by totalOccurrences if applicable
  const maxN = template.endMode === 'for_n_occurrences' && template.totalOccurrences != null
    ? Math.min(count, template.totalOccurrences)
    : count

  const out: Date[] = [template.startDate]
  let cursor = template.startDate

  // For the iteration we treat occurrencesRemaining as decreasing from
  // totalOccurrences (or count) so the guard inside computeNextOccurrenceDate
  // doesn't short-circuit. The caller's actual template row is not mutated.
  const synthetic: OccurrenceTemplate = {
    ...template,
    occurrencesRemaining: maxN,
  }

  for (let i = 1; i < maxN; i++) {
    const next = computeNextOccurrenceDate({ ...synthetic, occurrencesRemaining: maxN - i }, cursor)
    if (next == null) break
    out.push(next)
    cursor = next
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// computeSpawnedSnapshotHash
//
// Returns a SHA-256 hex hash of the canonical fields that determine whether
// a spawned draft is "as the template intended" versus "the user has edited
// it". Used by the bulk-approve-unchanged flow:
//
//   1. Spawn writes hash to draft.spawnedSnapshotHash.
//   2. Any user edit to the draft sets draft.spawnedSnapshotHash = null.
//   3. Bulk-approve picks up only drafts where spawnedSnapshotHash matches
//      the current template hash (so they're guaranteed unchanged).
//
// Canonical JSON rules (so two equivalent templates always hash the same):
//   - Numeric fields are written with no trailing zeros (1 not 1.00).
//   - String fields with null/undefined are omitted entirely.
//   - Lines are sorted by sortOrder ascending, then by id ascending as
//     tiebreaker.
//   - Dates are serialised as YYYY-MM-DD (ignoring time of day, since
//     occurrenceDate IS day-precision).
//
// What's hashed:
//   - kind, amount (computed from lines), defaultDueOffsetDays
//   - lines: [{ glAccountId, side, amount, taxRateId, memberId, description }]
//   - occurrenceDate (the date this specific draft was scheduled for)
//
// What's NOT hashed (these can change without invalidating the snapshot):
//   - name, notes (cosmetic)
//   - createdAt, updatedAt
//   - templateId, familyId (identity, not content)
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  taxRateId?: string | null
  memberId?: string | null
  description?: string | null
  sortOrder?: number
  id?: string
}

export interface SnapshotInput {
  kind: TemplateKind
  defaultDueOffsetDays: number
  lines: SnapshotLine[]
  occurrenceDate: Date
}

function canonicalNumber(n: number): number {
  // JSON.stringify already drops trailing zeros for numbers, but we round
  // to 4 decimal places to avoid floating-point representation noise
  // changing the hash (e.g. 0.1 + 0.2 = 0.30000000000000004).
  return Math.round(n * 10000) / 10000
}

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC. occurrenceDate is day-precision so timezone doesn't
  // matter for hashing as long as we're consistent.
  return d.toISOString().slice(0, 10)
}

export function computeSpawnedSnapshotHash(input: SnapshotInput): string {
  const linesSorted = [...input.lines].sort((a, b) => {
    const sa = a.sortOrder ?? 0
    const sb = b.sortOrder ?? 0
    if (sa !== sb) return sa - sb
    return (a.id ?? '').localeCompare(b.id ?? '')
  })

  const canonical = {
    kind: input.kind,
    defaultDueOffsetDays: input.defaultDueOffsetDays,
    occurrenceDate: isoDate(input.occurrenceDate),
    lines: linesSorted.map(l => {
      const obj: Record<string, unknown> = {
        glAccountId: l.glAccountId,
        side: l.side,
        amount: canonicalNumber(l.amount),
      }
      // Optional fields: omit when null/undefined so the hash is stable
      // whether the column is missing or explicitly null.
      if (l.taxRateId) obj.taxRateId = l.taxRateId
      if (l.memberId) obj.memberId = l.memberId
      if (l.description) obj.description = l.description
      return obj
    }),
  }

  const json = JSON.stringify(canonical)
  return createHash('sha256').update(json).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
//
// Used by Chunk B (CRUD) but exported here so route handlers / forms can
// reuse the same checks before submitting.
// ─────────────────────────────────────────────────────────────────────────────

export function isKnownFrequency(s: string): s is Frequency {
  return (KNOWN_FREQUENCIES as readonly string[]).includes(s)
}

export function isKnownEndMode(s: string): s is EndMode {
  return (KNOWN_END_MODES as readonly string[]).includes(s)
}

export function isKnownKind(s: string): s is TemplateKind {
  return (KNOWN_KINDS as readonly string[]).includes(s)
}

// =============================================================================
// CHUNK B — CRUD with audit logging
//
// Q1 (locked): all validation errors THROW with descriptive messages. The
//   calling route catches and returns 422 with the error text.
// Q2 (locked): all functions use the prisma singleton directly. The spawn
//   worker (2b.3) does its own queries; it does not call back into this
//   service from within a $transaction.
// =============================================================================

// ── Input types for create / update ──────────────────────────────────────────

export interface TemplateLineInput {
  description: string
  qty?: number
  unitPrice: number
  amount: number      // caller computes qty * unitPrice; we trust it
  side: 'debit' | 'credit'
  glAccountId: string
  taxRateId?: string | null
  memberId?: string | null
  sortOrder?: number
  gstApplicable?: boolean
  gstRate?: number
}

export interface CreateTemplateInput {
  kind: TemplateKind
  name: string

  counterpartyId?: string | null
  accountId?: string | null
  categoryId?: string | null
  entityId?: string | null
  locationId?: string | null
  memberId?: string | null

  enabled?: boolean
  createAutomatically?: boolean
  notifyOnCreate?: boolean
  showOnCalendar?: boolean
  includeInBudget?: boolean
  createInAdvanceDays?: number
  remindInAdvanceDays?: number | null

  frequency: Frequency
  interval?: number
  daysOfWeek?: number[] | null
  dayOfMonth?: number | null
  monthOfYear?: number | null
  startDate: Date
  endMode?: EndMode
  endDate?: Date | null
  totalOccurrences?: number | null

  defaultDueOffsetDays?: number

  isTaxTracked?: boolean
  taxClassification?: string | null
  taxRate?: number | null

  // Payslip template fields (income templates only)
  payslipEnabled?: boolean
  grossPay?: number | null
  netPay?: number | null
  grossIncomeGlAccountId?: string | null
  bankGlAccountId?: string | null
  paygWithheld?: number | null
  paygGlAccountId?: string | null
  sgcAmount?: number | null
  sgcGlAccountId?: string | null
  payslipComponents?: unknown
  payslipDeductions?: unknown

  notes?: string | null

  lines: TemplateLineInput[]
}

// UpdateTemplateInput is the same shape but all fields optional except those
// that uniquely identify (none — id comes as a separate parameter).
// nextOccurrenceDate may be supplied directly to override the computed cursor
// (e.g. after a draft is deleted and the user needs to reset the spawn date).
export type UpdateTemplateInput = Partial<CreateTemplateInput> & {
  nextOccurrenceDate?: Date | null
}

// ── Validation ───────────────────────────────────────────────────────────────

function assertValidTemplateInput(input: CreateTemplateInput | UpdateTemplateInput, mode: 'create' | 'update'): void {
  // Required fields on create
  if (mode === 'create') {
    if (!input.kind) throw new Error('Template kind is required')
    if (!input.name?.trim()) throw new Error('Template name is required')
    if (!input.frequency) throw new Error('Template frequency is required')
    if (!input.startDate) throw new Error('Template startDate is required')
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error('Template must have at least one line')
    }
  }

  // Kind whitelist
  if (input.kind != null && !isKnownKind(input.kind)) {
    throw new Error(`Unknown template kind: "${input.kind}"`)
  }
  // Frequency whitelist
  if (input.frequency != null && !isKnownFrequency(input.frequency)) {
    throw new Error(`Unknown template frequency: "${input.frequency}"`)
  }
  // End mode whitelist
  if (input.endMode != null && !isKnownEndMode(input.endMode)) {
    throw new Error(`Unknown template endMode: "${input.endMode}"`)
  }

  // Interval positive
  if (input.interval != null && input.interval < 1) {
    throw new Error(`Template interval must be at least 1, got ${input.interval}`)
  }
  // dayOfMonth in range
  if (input.dayOfMonth != null && (input.dayOfMonth < 1 || input.dayOfMonth > 31)) {
    throw new Error(`Template dayOfMonth must be 1-31, got ${input.dayOfMonth}`)
  }
  // monthOfYear in range
  if (input.monthOfYear != null && (input.monthOfYear < 1 || input.monthOfYear > 12)) {
    throw new Error(`Template monthOfYear must be 1-12, got ${input.monthOfYear}`)
  }
  // endMode-specific constraints
  if (input.endMode === 'until' && !input.endDate) {
    throw new Error(`Template endMode='until' requires endDate`)
  }
  if (input.endMode === 'for_n_occurrences' && (input.totalOccurrences ?? 0) < 1) {
    throw new Error(`Template endMode='for_n_occurrences' requires totalOccurrences >= 1`)
  }

  // Lines: side whitelist, amounts non-negative, balance check
  if (input.lines != null) {
    if (input.lines.length === 0) {
      throw new Error('Template must have at least one line')
    }
    let totalDR = 0
    let totalCR = 0
    for (const [i, line] of input.lines.entries()) {
      if (!line.glAccountId) {
        throw new Error(`Line ${i + 1}: glAccountId is required`)
      }
      if (line.side !== 'debit' && line.side !== 'credit') {
        throw new Error(`Line ${i + 1}: side must be 'debit' or 'credit', got "${line.side}"`)
      }
      if (line.amount < 0) {
        throw new Error(`Line ${i + 1}: amount must be >= 0, got ${line.amount}`)
      }
      if (line.side === 'debit') totalDR += line.amount
      else totalCR += line.amount
    }
    // Templates with >= 2 lines must balance. A single line is allowed for
    // the simple-spawn case where the spawn worker will add the counter-leg
    // (e.g. expense category line; spawn adds CR AP).
    if (input.lines.length >= 2) {
      if (Math.abs(totalDR - totalCR) > 0.005) {
        throw new Error(
          `Template lines do not balance — debits ${totalDR.toFixed(2)} ≠ credits ${totalCR.toFixed(2)}`,
        )
      }
    }
  }

  // Payslip mode requires income kind + GL accounts
  if (input.payslipEnabled === true) {
    if (input.kind !== 'income') {
      throw new Error('Payslip mode is only valid for income templates')
    }
    if (!input.grossIncomeGlAccountId) {
      throw new Error('Payslip mode requires grossIncomeGlAccountId')
    }
    if (!input.bankGlAccountId) {
      throw new Error('Payslip mode requires bankGlAccountId')
    }
    if ((input.paygWithheld ?? 0) > 0 && !input.paygGlAccountId) {
      throw new Error('paygWithheld is positive but paygGlAccountId is not set')
    }
  }
}

// ── createTemplate ───────────────────────────────────────────────────────────

const TEMPLATE_INCLUDE = {
  lines: {
    orderBy: { sortOrder: 'asc' as const },
  },
}

export async function createTemplate(
  user: SessionUser,
  input: CreateTemplateInput,
): Promise<Awaited<ReturnType<typeof prisma.financeRecurringTemplate.findFirst<{ include: typeof TEMPLATE_INCLUDE }>>>> {
  assertValidTemplateInput(input, 'create')

  // Validate that every line's glAccountId belongs to this family.
  // This is the same family-isolation check the posting helpers do, but
  // applied at template creation so bad data never enters the DB.
  const glIds = [...new Set(input.lines.map(l => l.glAccountId))]
  const validGlIds = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId: user.familyId },
    select: { id: true },
  })
  if (validGlIds.length !== glIds.length) {
    throw new Error(
      `One or more line GL accounts not found for this family ` +
      `(referenced ${glIds.length}, found ${validGlIds.length})`,
    )
  }

  // For payslip templates also validate the per-side GL accounts
  if (input.payslipEnabled) {
    const payslipGlIds = [
      input.grossIncomeGlAccountId,
      input.bankGlAccountId,
      input.paygGlAccountId,
      input.sgcGlAccountId,
    ].filter((v): v is string => !!v)
    if (payslipGlIds.length > 0) {
      const validPayslipGls = await prisma.financeCategory.findMany({
        where: { id: { in: payslipGlIds }, familyId: user.familyId },
        select: { id: true },
      })
      if (validPayslipGls.length !== new Set(payslipGlIds).size) {
        throw new Error('One or more payslip GL accounts not found for this family')
      }
    }
  }

  // Decision A1: startDate IS the first occurrence; nextOccurrenceDate starts there.
  const nextOccurrenceDate = input.startDate

  // Default occurrencesRemaining = totalOccurrences when endMode='for_n_occurrences'.
  const occurrencesRemaining =
    input.endMode === 'for_n_occurrences' ? (input.totalOccurrences ?? null) : null

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.financeRecurringTemplate.create({
      data: {
        familyId: user.familyId,
        kind: input.kind,
        name: input.name.trim(),

        counterpartyId: input.counterpartyId ?? null,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        entityId: input.entityId ?? null,
        locationId: input.locationId ?? null,
        memberId: input.memberId ?? null,

        enabled: input.enabled ?? true,
        createAutomatically: input.createAutomatically ?? true,
        notifyOnCreate: input.notifyOnCreate ?? false,
        showOnCalendar: input.showOnCalendar ?? true,
        includeInBudget: input.includeInBudget ?? true,
        createInAdvanceDays: input.createInAdvanceDays ?? 0,
        remindInAdvanceDays: input.remindInAdvanceDays ?? null,

        frequency: input.frequency,
        interval: input.interval ?? 1,
        daysOfWeek: input.daysOfWeek ? JSON.stringify(input.daysOfWeek) : null,
        dayOfMonth: input.dayOfMonth ?? null,
        monthOfYear: input.monthOfYear ?? null,
        startDate: input.startDate,
        endMode: input.endMode ?? 'forever',
        endDate: input.endDate ?? null,
        totalOccurrences: input.totalOccurrences ?? null,
        occurrencesRemaining,

        nextOccurrenceDate,
        defaultDueOffsetDays: input.defaultDueOffsetDays ?? 0,

        isTaxTracked: input.isTaxTracked ?? false,
        taxClassification: input.taxClassification ?? null,
        taxRate: input.taxRate ?? null,

        payslipEnabled: input.payslipEnabled ?? false,
        grossPay: input.grossPay ?? null,
        netPay: input.netPay ?? null,
        grossIncomeGlAccountId: input.grossIncomeGlAccountId ?? null,
        bankGlAccountId: input.bankGlAccountId ?? null,
        paygWithheld: input.paygWithheld ?? null,
        paygGlAccountId: input.paygGlAccountId ?? null,
        sgcAmount: input.sgcAmount ?? null,
        sgcGlAccountId: input.sgcGlAccountId ?? null,
        payslipComponents: input.payslipComponents != null ? JSON.stringify(input.payslipComponents) : null,
        payslipDeductions: input.payslipDeductions != null ? JSON.stringify(input.payslipDeductions) : null,

        createdBy: user.id,
        notes: input.notes ?? null,
        isActive: true,
      },
    })

    // Insert lines
    await tx.financeRecurringTemplateLine.createMany({
      data: input.lines.map((l, idx) => ({
        templateId: template.id,
        description: l.description,
        qty: l.qty ?? 1,
        unitPrice: l.unitPrice,
        amount: l.amount,
        side: l.side,
        glAccountId: l.glAccountId,
        taxRateId: l.taxRateId ?? null,
        memberId: l.memberId ?? null,
        sortOrder: l.sortOrder ?? idx,
        gstApplicable: l.gstApplicable ?? false,
        gstRate: l.gstRate ?? 0,
      })),
    })

    return tx.financeRecurringTemplate.findFirst({
      where: { id: template.id, familyId: user.familyId },
      include: TEMPLATE_INCLUDE,
    })
  })

  if (created) {
    await createAuditLog(
      user,
      'create',
      'financeRecurringTemplate',
      created.id,
      `Created recurring template: ${created.name}`,
      {
        kind: created.kind,
        frequency: created.frequency,
        startDate: created.startDate.toISOString(),
        lineCount: input.lines.length,
      },
    )
  }

  return created
}

// ── updateTemplate ───────────────────────────────────────────────────────────
//
// Replaces lines wholesale when `input.lines` is provided. Existing lines are
// deleted and the new set is inserted. Field updates are partial (only
// supplied fields change).
//
// Updating frequency / startDate / interval / dayOfMonth / monthOfYear /
// endMode / endDate / totalOccurrences resets `nextOccurrenceDate` to
// `lastSpawnedDate` (if any) projected forward, or to `startDate` if no
// spawns have occurred yet. This keeps the spawn cursor correct after the
// user changes the schedule.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTemplate(
  user: SessionUser,
  id: string,
  input: UpdateTemplateInput,
): Promise<Awaited<ReturnType<typeof prisma.financeRecurringTemplate.findFirst<{ include: typeof TEMPLATE_INCLUDE }>>>> {
  assertValidTemplateInput(input, 'update')

  const existing = await prisma.financeRecurringTemplate.findFirst({
    where: { id, familyId: user.familyId },
    include: TEMPLATE_INCLUDE,
  })
  if (!existing) {
    throw new Error('Template not found')
  }

  // Validate any new GL account references belong to family
  if (input.lines != null) {
    const glIds = [...new Set(input.lines.map(l => l.glAccountId))]
    const validGlIds = await prisma.financeCategory.findMany({
      where: { id: { in: glIds }, familyId: user.familyId },
      select: { id: true },
    })
    if (validGlIds.length !== glIds.length) {
      throw new Error('One or more line GL accounts not found for this family')
    }
  }

  // Detect schedule-affecting changes
  const scheduleChanged =
    (input.frequency != null && input.frequency !== existing.frequency) ||
    (input.interval != null && input.interval !== existing.interval) ||
    (input.startDate != null && input.startDate.getTime() !== existing.startDate.getTime()) ||
    (input.dayOfMonth !== undefined && input.dayOfMonth !== existing.dayOfMonth) ||
    (input.monthOfYear !== undefined && input.monthOfYear !== existing.monthOfYear) ||
    (input.endMode != null && input.endMode !== existing.endMode) ||
    (input.endDate !== undefined &&
      (input.endDate?.getTime() ?? null) !== (existing.endDate?.getTime() ?? null)) ||
    (input.totalOccurrences !== undefined && input.totalOccurrences !== existing.totalOccurrences)

  // Compute new nextOccurrenceDate when the schedule changes.
  let newNextOccurrenceDate: Date | undefined
  let newOccurrencesRemaining: number | null | undefined
  if (scheduleChanged) {
    const effectiveStartDate = input.startDate ?? existing.startDate
    if (existing.lastSpawnedDate == null) {
      // No spawns yet — startDate is still the first occurrence.
      newNextOccurrenceDate = effectiveStartDate
    } else {
      // Spawns have already occurred. Compute the next occurrence after
      // lastSpawnedDate using the updated schedule.
      const projected = computeNextOccurrenceDate(
        {
          frequency: input.frequency ?? existing.frequency,
          interval: input.interval ?? existing.interval,
          dayOfMonth: input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth,
          monthOfYear: input.monthOfYear !== undefined ? input.monthOfYear : existing.monthOfYear,
          startDate: effectiveStartDate,
          endMode: input.endMode ?? existing.endMode,
          endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
          totalOccurrences: input.totalOccurrences !== undefined ? input.totalOccurrences : existing.totalOccurrences,
          occurrencesRemaining: existing.occurrencesRemaining,
        },
        existing.lastSpawnedDate,
      )
      // If projection returned null (template now ended), use a date far in
      // the past so the spawn worker skips it. We don't null out the column
      // because schema requires it. Using the start date is safe — the
      // worker will see endDate < startDate or occurrencesRemaining<=0 and skip.
      newNextOccurrenceDate = projected ?? effectiveStartDate
    }

    if (input.endMode === 'for_n_occurrences' && input.totalOccurrences != null) {
      // Reset remaining to the new total, minus what's already been spawned.
      const spawnedSoFar = existing.totalOccurrences != null && existing.occurrencesRemaining != null
        ? existing.totalOccurrences - existing.occurrencesRemaining
        : 0
      newOccurrencesRemaining = Math.max(0, input.totalOccurrences - spawnedSoFar)
    } else if (input.endMode != null && input.endMode !== 'for_n_occurrences') {
      newOccurrencesRemaining = null
    }
  }

  // Build data object — only fields actually present on input are updated.
  const data: Record<string, unknown> = {}
  if (input.name != null) data.name = input.name.trim()
  if (input.counterpartyId !== undefined) data.counterpartyId = input.counterpartyId ?? null
  if (input.accountId !== undefined) data.accountId = input.accountId ?? null
  if (input.categoryId !== undefined) data.categoryId = input.categoryId ?? null
  if (input.entityId !== undefined) data.entityId = input.entityId ?? null
  if (input.locationId !== undefined) data.locationId = input.locationId ?? null
  if (input.memberId !== undefined) data.memberId = input.memberId ?? null
  if (input.enabled != null) data.enabled = input.enabled
  if (input.createAutomatically != null) data.createAutomatically = input.createAutomatically
  if (input.notifyOnCreate != null) data.notifyOnCreate = input.notifyOnCreate
  if (input.showOnCalendar != null) data.showOnCalendar = input.showOnCalendar
  if (input.includeInBudget != null) data.includeInBudget = input.includeInBudget
  if (input.createInAdvanceDays != null) data.createInAdvanceDays = input.createInAdvanceDays
  if (input.remindInAdvanceDays !== undefined) data.remindInAdvanceDays = input.remindInAdvanceDays ?? null
  if (input.frequency != null) data.frequency = input.frequency
  if (input.interval != null) data.interval = input.interval
  if (input.daysOfWeek !== undefined) {
    data.daysOfWeek = input.daysOfWeek ? JSON.stringify(input.daysOfWeek) : null
  }
  if (input.dayOfMonth !== undefined) data.dayOfMonth = input.dayOfMonth ?? null
  if (input.monthOfYear !== undefined) data.monthOfYear = input.monthOfYear ?? null
  if (input.startDate != null) data.startDate = input.startDate
  if (input.endMode != null) data.endMode = input.endMode
  if (input.endDate !== undefined) data.endDate = input.endDate ?? null
  if (input.totalOccurrences !== undefined) data.totalOccurrences = input.totalOccurrences ?? null
  if (input.defaultDueOffsetDays != null) data.defaultDueOffsetDays = input.defaultDueOffsetDays
  if (input.isTaxTracked != null) data.isTaxTracked = input.isTaxTracked
  if (input.taxClassification !== undefined) data.taxClassification = input.taxClassification ?? null
  if (input.taxRate !== undefined) data.taxRate = input.taxRate ?? null
  if (input.payslipEnabled != null) data.payslipEnabled = input.payslipEnabled
  if (input.grossPay !== undefined) data.grossPay = input.grossPay ?? null
  if (input.netPay !== undefined) data.netPay = input.netPay ?? null
  if (input.grossIncomeGlAccountId !== undefined) data.grossIncomeGlAccountId = input.grossIncomeGlAccountId ?? null
  if (input.bankGlAccountId !== undefined) data.bankGlAccountId = input.bankGlAccountId ?? null
  if (input.paygWithheld !== undefined) data.paygWithheld = input.paygWithheld ?? null
  if (input.paygGlAccountId !== undefined) data.paygGlAccountId = input.paygGlAccountId ?? null
  if (input.sgcAmount !== undefined) data.sgcAmount = input.sgcAmount ?? null
  if (input.sgcGlAccountId !== undefined) data.sgcGlAccountId = input.sgcGlAccountId ?? null
  if (input.payslipComponents !== undefined) {
    data.payslipComponents = input.payslipComponents != null ? JSON.stringify(input.payslipComponents) : null
  }
  if (input.payslipDeductions !== undefined) {
    data.payslipDeductions = input.payslipDeductions != null ? JSON.stringify(input.payslipDeductions) : null
  }
  if (input.notes !== undefined) data.notes = input.notes ?? null

  if (newNextOccurrenceDate !== undefined) data.nextOccurrenceDate = newNextOccurrenceDate
  if (newOccurrencesRemaining !== undefined) data.occurrencesRemaining = newOccurrencesRemaining
  // Explicit "Next spawn date" override wins over any computed reset
  // Null is never valid for nextOccurrenceDate (non-nullable column) so guard against it
  if (input.nextOccurrenceDate != null) data.nextOccurrenceDate = input.nextOccurrenceDate

  // Atomic: update fields + replace lines (if provided)
  const updated = await prisma.$transaction(async (tx) => {
    await tx.financeRecurringTemplate.update({
      where: { id },
      data,
    })

    if (input.lines != null) {
      await tx.financeRecurringTemplateLine.deleteMany({
        where: { templateId: id },
      })
      await tx.financeRecurringTemplateLine.createMany({
        data: input.lines.map((l, idx) => ({
          templateId: id,
          description: l.description,
          qty: l.qty ?? 1,
          unitPrice: l.unitPrice,
          amount: l.amount,
          side: l.side,
          glAccountId: l.glAccountId,
          taxRateId: l.taxRateId ?? null,
          memberId: l.memberId ?? null,
          sortOrder: l.sortOrder ?? idx,
          gstApplicable: l.gstApplicable ?? false,
          gstRate: l.gstRate ?? 0,
        })),
      })
    }

    return tx.financeRecurringTemplate.findFirst({
      where: { id, familyId: user.familyId },
      include: TEMPLATE_INCLUDE,
    })
  })

  if (updated) {
    await createAuditLog(
      user,
      'update',
      'financeRecurringTemplate',
      updated.id,
      `Updated recurring template: ${updated.name}`,
      {
        changedFields: Object.keys(data),
        linesReplaced: input.lines != null,
        scheduleChanged,
      },
    )
  }

  return updated
}

// ── deleteTemplate ───────────────────────────────────────────────────────────
//
// Deletes the template. Per schema:
//   - FinanceRecurringTemplateLine cascades (deleted automatically)
//   - FinanceRecurringBill / FinanceIncomeEntry with templateId pointing here
//     keep existing (onDelete: SetNull on the FK). Already-spawned drafts and
//     posted bills/income retain their lifecycle independently of the template.
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteTemplate(
  user: SessionUser,
  id: string,
): Promise<{ deleted: boolean; orphanedDrafts: number }> {
  const existing = await prisma.financeRecurringTemplate.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true, name: true, kind: true },
  })
  if (!existing) {
    throw new Error('Template not found')
  }

  // Count spawned drafts before delete so we can report orphaning to the user.
  // 'orphaned' here just means status='draft' rows whose templateId becomes
  // null after the delete — they still work, they just no longer link back
  // to a template for "edit master" actions.
  const draftCount = existing.kind === 'bill'
    ? await prisma.financeRecurringBill.count({
        where: { templateId: id, familyId: user.familyId, status: 'draft' },
      })
    : await prisma.financeIncomeEntry.count({
        where: { templateId: id, familyId: user.familyId, status: 'draft' },
      })

  await prisma.financeRecurringTemplate.delete({ where: { id } })

  await createAuditLog(
    user,
    'delete',
    'financeRecurringTemplate',
    id,
    `Deleted recurring template: ${existing.name}`,
    {
      kind: existing.kind,
      orphanedDraftCount: draftCount,
    },
  )

  return { deleted: true, orphanedDrafts: draftCount }
}

// ── getTemplate ──────────────────────────────────────────────────────────────

export async function getTemplate(
  familyId: string,
  id: string,
) {
  return prisma.financeRecurringTemplate.findFirst({
    where: { id, familyId },
    include: TEMPLATE_INCLUDE,
  })
}

// ── listTemplates ────────────────────────────────────────────────────────────

export interface ListTemplatesOptions {
  /** Filter by kind. Omit for both. */
  kind?: TemplateKind
  /** Include disabled templates. Default: only enabled. */
  includeDisabled?: boolean
  /** Include soft-deleted (isActive=false). Default: only active. */
  includeInactive?: boolean
}

export async function listTemplates(
  familyId: string,
  options: ListTemplatesOptions = {},
) {
  const where: Record<string, unknown> = { familyId }
  if (options.kind) where.kind = options.kind
  if (!options.includeDisabled) where.enabled = true
  if (!options.includeInactive) where.isActive = true

  return prisma.financeRecurringTemplate.findMany({
    where,
    include: TEMPLATE_INCLUDE,
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
}
