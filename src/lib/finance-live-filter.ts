import type { Prisma } from '@prisma/client'

/**
 * Shared "live bill / live income" where-fragments — the single source of truth
 * for "this is a real, actionable obligation/receivable", not a draft, a
 * cancelled draft, or a voided entry.
 *
 * WHY THIS EXISTS
 * The canonical list routes (`/api/finance/bills`, `/api/finance/income`) filter
 * out draft/cancelled/voided rows. Numerous SECONDARY read paths — dashboard
 * widgets, the home page, the daily briefing, the calendar feed, and the AI
 * assistant tools — independently re-queried these tables with only
 * `isActive: true` (and sometimes `paid: false`), and so leaked cancelled and
 * voided rows into "Upcoming Bills"/"Upcoming Income" surfaces even though the
 * GL and the canonical lists correctly excluded them. That is the classic
 * "fix one, miss others" drift this codebase guards against. Centralising the
 * predicate here means one definition, every caller, no divergence.
 *
 * Semantics (mirrors the canonical bills/income GET routes):
 *   - isVoided: false        → a voided entry carries a reversed journal and is
 *                              audit-only; never a live obligation.
 *   - status NOT draft/cancelled, OR status IS NULL → drafts live in the Drafts
 *                              inbox; cancelled drafts are audit-only. Legacy
 *                              rows (status = null) predate the status field and
 *                              count as live. `awaiting_payment`/`paid` are live.
 *
 * Spread into an existing `where`:
 *   where: { familyId, isActive: true, paid: false, ...liveBillWhere }
 *
 * NOTE: each fragment contributes a top-level `OR`. Do not spread it into a
 * `where` that already declares its own top-level `OR` (the second would
 * overwrite the first). No current caller does; if one needs to, nest both
 * under `AND` instead.
 */
export const liveBillWhere = {
  isVoided: false,
  OR: [{ status: null }, { status: { notIn: ['draft', 'cancelled'] } }],
} satisfies Prisma.FinanceRecurringBillWhereInput

export const liveIncomeWhere = {
  isVoided: false,
  OR: [{ status: null }, { status: { notIn: ['draft', 'cancelled'] } }],
} satisfies Prisma.FinanceIncomeEntryWhereInput
