import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

/**
 * One-time data repair: recurring-template date corruption (finance).
 *
 * Background: the income/bill PATCH spawn handlers previously stepped the next
 * occurrence from `max(scheduledDate, new Date())`, injecting the current
 * wall-clock time-of-day into day-precision dates that must be stored as UTC
 * midnight. In Sydney (UTC+10) this rendered off-by-one (e.g. an instant stored
 * at 2026-06-01T21:17Z shows as "2 June"). The code path is now fixed; this
 * script repairs the rows already written with polluted instants.
 *
 * SAFETY MODEL
 *  - Matches each target by `id` and verifies the *current* value matches the
 *    known polluted instant (compared as JS timestamps, not raw SQLite TEXT) —
 *    so the script is idempotent and never clobbers an unexpected value.
 *  - DRY-RUN by default. Pass --apply to commit (single transaction).
 *  - The one posted GL journal is re-dated only after asserting it is posted,
 *    not reversed, not a reversal, and that the family's period lock does not
 *    cover the target date. Amounts are untouched (50 DR / 50 CR) and both the
 *    old and new dates fall in the same fiscal month (FY starts July), so the
 *    trial balance, P&L and balance sheet are unchanged by the re-date.
 *
 * USAGE
 *   Dry-run (local):   npx tsx scripts/repair-template-dates.ts
 *   Apply  (local):    npx tsx scripts/repair-template-dates.ts --apply
 *   Include cosmetic:  ... --apply --include-optional
 *   Live NAS:          set DATABASE_URL=file:/data/homebase.db first, then run.
 *
 * This repair does NOT run automatically with container-start migrations.
 */

const APPLY = process.argv.includes('--apply')
const INCLUDE_OPTIONAL = process.argv.includes('--include-optional')

// Default to the populated local DB (data/homebase.db). The NAS sets DATABASE_URL.
const DB_URL = process.env.DATABASE_URL ?? 'file:./data/homebase.db'

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: DB_URL })
  return new PrismaClient({ adapter, log: ['error'] })
}
const prisma = createPrismaClient()

type Model = 'template' | 'income' | 'bill' | 'journal'

interface Target {
  label: string
  model: Model
  id: string
  field: 'nextOccurrenceDate' | 'nextExpectedDate' | 'billDate' | 'nextDueDate' | 'date'
  from: Date | null // known polluted current value (null = currently NULL)
  to: Date          // corrected UTC-midnight value
  optional?: boolean
  postedJournalGuard?: boolean
}

const D = (s: string) => new Date(s)

const TARGETS: Target[] = [
  // Templates — nextOccurrenceDate
  { label: 'Template Charity nextOccurrenceDate',
    model: 'template', id: 'cmpc2cray002701o2h5cw98zt', field: 'nextOccurrenceDate',
    from: D('2026-06-26T03:57:23.547Z'), to: D('2026-06-18T00:00:00.000Z') },
  { label: 'Template Gaulkes - Rent and Rates nextOccurrenceDate',
    model: 'template', id: 'cmpc2mfl1002c01o2ggk2d53c', field: 'nextOccurrenceDate',
    from: D('2026-06-04T00:45:42.235Z'), to: D('2026-06-03T00:00:00.000Z') },
  { label: "Template Michelle's Salary nextOccurrenceDate",
    model: 'template', id: 'cmpatt50y001c01ligyg5xnou', field: 'nextOccurrenceDate',
    from: D('2026-06-01T21:17:28.736Z'), to: D('2026-06-01T00:00:00.000Z') },

  // Income drafts — nextExpectedDate
  { label: "Income draft Michelle's Salary nextExpectedDate",
    model: 'income', id: 'cmplpjajo000b01nrckunjlfd', field: 'nextExpectedDate',
    from: D('2026-06-01T21:17:28.736Z'), to: D('2026-06-01T00:00:00.000Z') },
  { label: 'Income draft Gaulkes nextExpectedDate',
    model: 'income', id: 'cmporurx9009701lc40bim29g', field: 'nextExpectedDate',
    from: D('2026-06-04T00:45:42.235Z'), to: D('2026-06-03T00:00:00.000Z') },

  // Bill child Charity — billDate (NULL) + nextDueDate
  { label: 'Bill child Charity billDate (NULL -> 18 Jun)',
    model: 'bill', id: 'cmpm3tl25009a01nr67t3kngf', field: 'billDate',
    from: null, to: D('2026-06-18T00:00:00.000Z') },
  { label: 'Bill child Charity nextDueDate',
    model: 'bill', id: 'cmpm3tl25009a01nr67t3kngf', field: 'nextDueDate',
    from: D('2026-06-26T03:57:23.547Z'), to: D('2026-06-25T00:00:00.000Z') },

  // Posted GL journal Charity — date (guarded)
  { label: 'Posted journal Charity date',
    model: 'journal', id: 'cmpm3tl7g009b01nr56w0d36i', field: 'date',
    from: D('2026-06-26T03:57:23.547Z'), to: D('2026-06-18T00:00:00.000Z'),
    postedJournalGuard: true },

  // Optional / cosmetic — cancelled income (inert; only with --include-optional)
  { label: 'Cancelled Gaulkes income nextExpectedDate (cosmetic)',
    model: 'income', id: 'cmpev68ev000c01rxycvgd9tr', field: 'nextExpectedDate',
    from: D('2026-05-28T02:20:53.909Z'), to: D('2026-05-27T00:00:00.000Z'),
    optional: true },
]

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.getTime() === b.getTime()
}

const iso = (d: Date | null) => (d ? d.toISOString() : 'NULL')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readRow(t: Target): Promise<any> {
  switch (t.model) {
    case 'template': return prisma.financeRecurringTemplate.findUnique({ where: { id: t.id } })
    case 'income':   return prisma.financeIncomeEntry.findUnique({ where: { id: t.id } })
    case 'bill':     return prisma.financeRecurringBill.findUnique({ where: { id: t.id } })
    case 'journal':  return prisma.financeJournalEntry.findUnique({ where: { id: t.id } })
  }
}

function updateOp(t: Target) {
  switch (t.model) {
    case 'template':
      return prisma.financeRecurringTemplate.update({ where: { id: t.id }, data: { nextOccurrenceDate: t.to } })
    case 'income':
      return prisma.financeIncomeEntry.update({ where: { id: t.id }, data: { nextExpectedDate: t.to } })
    case 'bill':
      return t.field === 'billDate'
        ? prisma.financeRecurringBill.update({ where: { id: t.id }, data: { billDate: t.to } })
        : prisma.financeRecurringBill.update({ where: { id: t.id }, data: { nextDueDate: t.to } })
    case 'journal':
      return prisma.financeJournalEntry.update({ where: { id: t.id }, data: { date: t.to } })
    default:
      throw new Error(`Unknown model: ${t.model}`)
  }
}

async function main() {
  console.log('\n=== repair-template-dates ===')
  console.log(`DB URL : ${DB_URL}`)
  console.log(`Mode   : ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes; pass --apply to commit)'}`)
  console.log(`Optional cosmetic row: ${INCLUDE_OPTIONAL ? 'included' : 'skipped (pass --include-optional to include)'}\n`)

  const toApply: Target[] = []
  let alreadyOk = 0, unexpected = 0, notFound = 0, blocked = 0

  for (const t of TARGETS) {
    if (t.optional && !INCLUDE_OPTIONAL) { console.log(`SKIP (optional)    ${t.label}`); continue }

    const row = await readRow(t)
    if (!row) { console.log(`NOT FOUND          ${t.label}  [id ${t.id}]`); notFound++; continue }

    const cur: Date | null = (row[t.field] as Date | null) ?? null

    if (sameInstant(cur, t.to)) { console.log(`ALREADY CORRECT    ${t.label}  (${iso(cur)})`); alreadyOk++; continue }

    if (!sameInstant(cur, t.from)) {
      console.log(`UNEXPECTED  SKIP   ${t.label}  current=${iso(cur)}  expected-polluted=${iso(t.from)}`)
      unexpected++; continue
    }

    if (t.postedJournalGuard) {
      if (row.isPosted !== true || row.isReversed !== false || row.reversalOfId !== null) {
        console.log(`BLOCKED (journal state)  ${t.label}  isPosted=${row.isPosted} isReversed=${row.isReversed} reversalOfId=${row.reversalOfId}`)
        blocked++; continue
      }
      const fam = await prisma.family.findUnique({ where: { id: row.familyId }, select: { periodLockedUntil: true } })
      const lock: Date | null = fam?.periodLockedUntil ?? null
      if (lock && lock.getTime() >= t.to.getTime()) {
        console.log(`BLOCKED (period lock)    ${t.label}  periodLockedUntil=${iso(lock)} covers target date`)
        blocked++; continue
      }
    }

    console.log(`WILL FIX           ${t.label}  ${iso(cur)} -> ${iso(t.to)}`)
    toApply.push(t)
  }

  console.log(`\nSummary: ${toApply.length} to fix · ${alreadyOk} already correct · ${unexpected} unexpected · ${notFound} not found · ${blocked} blocked`)

  if (toApply.length === 0) {
    console.log('\nNothing to apply.\n')
    return
  }
  if (!APPLY) {
    console.log('\nDRY-RUN complete — no changes written. Re-run with --apply to commit.\n')
    return
  }

  await prisma.$transaction(toApply.map(updateOp))
  console.log(`\nAPPLIED ${toApply.length} fixes.`)

  console.log('\nPost-apply verification:')
  for (const t of toApply) {
    const row = await readRow(t)
    const cur: Date | null = row ? ((row[t.field] as Date | null) ?? null) : null
    console.log(`  ${sameInstant(cur, t.to) ? 'OK  ' : 'FAIL'} ${t.label}  now=${iso(cur)}`)
  }
  console.log('')
}

main()
  .catch((e) => { console.error('Repair failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
