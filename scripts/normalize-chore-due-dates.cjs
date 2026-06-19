#!/usr/bin/env node
/**
 * normalize-chore-due-dates.cjs — one-off data repair.
 *
 * WHY: commit c428bae made early completion of a FLOATING chore (daily,
 * biweekly, or pin-less weekly/monthly) roll its nextDueDate forward from the
 * due date instead of from the completion date, skewing it one interval too far
 * (a chore done a day early advanced two days). The code fix lives in
 * src/lib/chore-helpers.ts (calculateNextDueDate, floating-vs-pinned branch);
 * this script repairs nextDueDate values that were already written skewed.
 *
 * WHAT: for every active, triggerOnComplete, FLOATING chore that has at least
 * one completion, recompute nextDueDate from its LATEST completion and rewrite
 * it if it differs. PINNED chores (weekly-with-weekday, monthly-family-with-
 * dayOfMonth) are left untouched — their nextDueDate is NOT corrupted, and the
 * pinned branch anchors on nextDueDate, so recomputing from the current
 * (post-completion) value would double-advance them.
 *
 * The recompute below MIRRORS calculateNextDueDate's floating path +
 * timezone.ts/utcMidnightToLocalMidnight EXACTLY. Keep them in sync. Correctness
 * was verified against the real helper on the live data set before applying.
 *
 * Usage:
 *   node scripts/normalize-chore-due-dates.cjs           # dry-run (no writes)
 *   node scripts/normalize-chore-due-dates.cjs --apply   # write changes
 */

const path = require('path')
const Database = require('better-sqlite3')

// ─── helpers ported verbatim from src/lib/chore-helpers.ts ────────────────────

function parseDaysOfWeek(value) {
  if (!value) return []
  try {
    const arr = JSON.parse(value)
    if (!Array.isArray(arr)) return []
    return [...new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
      (a, b) => a - b
    )
  } catch {
    return []
  }
}

function effectiveWeekdays(dayOfWeek, daysOfWeek) {
  const multi = parseDaysOfWeek(daysOfWeek)
  if (multi.length > 0) return multi
  if (dayOfWeek !== null) return [dayOfWeek]
  return []
}

function frequencyToMonths(frequency) {
  switch (frequency) {
    case 'monthly': return 1
    case 'bimonthly': return 2
    case 'quarterly': return 3
    case 'halfyearly': return 6
    case 'yearly': return 12
    default: return 0
  }
}

function nextWeekdayInSet(base, weekdays, allowSameDay) {
  const next = new Date(base)
  next.setUTCHours(0, 0, 0, 0)
  if (weekdays.length === 0) {
    next.setUTCDate(next.getUTCDate() + 7)
    return next
  }
  const currentDay = next.getUTCDay()
  for (let offset = allowSameDay ? 0 : 1; offset <= 7; offset++) {
    if (weekdays.includes((currentDay + offset) % 7)) {
      next.setUTCDate(next.getUTCDate() + offset)
      return next
    }
  }
  next.setUTCDate(next.getUTCDate() + 7)
  return next
}

function advanceByFrequency(base, frequency, weekdays, dayOfMonth) {
  const next = new Date(base)
  next.setUTCHours(0, 0, 0, 0)
  switch (frequency) {
    case 'daily': {
      next.setUTCDate(next.getUTCDate() + 1)
      break
    }
    case 'weekly': {
      return nextWeekdayInSet(next, weekdays, false)
    }
    case 'biweekly': {
      next.setUTCDate(next.getUTCDate() + 14)
      break
    }
    default: {
      const months = frequencyToMonths(frequency)
      if (months > 0) {
        next.setUTCMonth(next.getUTCMonth() + months)
        if (dayOfMonth !== null) {
          const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
          next.setUTCDate(Math.min(dayOfMonth, lastDay))
        }
      } else {
        next.setUTCDate(next.getUTCDate() + 7)
      }
    }
  }
  return next
}

// timezone.ts/localMidnightToUtc — verbatim
function localMidnightToUtc(dateStr, timezone) {
  const testDate = new Date(`${dateStr}T12:00:00Z`)
  const fmt = (tz) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(testDate)
  const utcParts = fmt('UTC')
  const localParts = fmt(timezone)
  const partsToMs = (parts) => {
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? '0')
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  }
  const offsetMs = partsToMs(localParts) - partsToMs(utcParts)
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMs)
}

function utcMidnightToLocalMidnight(date, timezone) {
  const localDateStr = date.toLocaleDateString('en-CA', { timeZone: timezone })
  return localMidnightToUtc(localDateStr, timezone)
}

function isPinned(chore) {
  return (
    (chore.frequency === 'weekly' && effectiveWeekdays(chore.dayOfWeek, chore.daysOfWeek).length > 0) ||
    (frequencyToMonths(chore.frequency) > 0 && chore.dayOfMonth !== null)
  )
}

/**
 * Floating-only recompute, mirroring calculateNextDueDate with baseDate =
 * completedAt. Throws if called on a pinned chore (caller must pre-filter).
 * Returns null when the result would exceed endDate (caller skips/deactivates).
 */
function recomputeFloatingNextDueDate(chore, completedAt, timezone) {
  if (chore.frequency === 'one-off') return null
  if (isPinned(chore)) throw new Error(`recompute called on pinned chore ${chore.id}`)

  const baseDateLocalStr = completedAt.toLocaleDateString('en-CA', { timeZone: timezone })
  const baseDateUTCMidnight = new Date(`${baseDateLocalStr}T00:00:00Z`)
  const next = advanceByFrequency(
    baseDateUTCMidnight,
    chore.frequency,
    effectiveWeekdays(chore.dayOfWeek, chore.daysOfWeek),
    chore.dayOfMonth
  )
  if (chore.endDate && next > chore.endDate) return null
  return utcMidnightToLocalMidnight(next, timezone)
}

module.exports = { recomputeFloatingNextDueDate, isPinned }

// ─── runner ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const apply = process.argv.includes('--apply')
  const dbPath = path.join(__dirname, '..', 'data', 'homebase.db')
  const db = new Database(dbPath, { readonly: !apply })

  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.frequency, c.dayOfWeek, c.daysOfWeek, c.dayOfMonth,
              c.nextDueDate, c.endDate, f.timezone AS tz
         FROM Chore c JOIN Family f ON f.id = c.familyId
        WHERE c.isActive = 1 AND c.triggerOnComplete = 1`
    )
    .all()

  const lastCompletionStmt = db.prepare(
    `SELECT completedAt FROM ChoreCompletion WHERE choreId = ? ORDER BY completedAt DESC LIMIT 1`
  )
  const updateStmt = db.prepare(`UPDATE Chore SET nextDueDate = ? WHERE id = ?`)

  // Prisma stores SQLite DateTime as e.g. "2026-06-19T14:00:00.000+00:00".
  const toDbFormat = (d) => d.toISOString().replace('Z', '+00:00')

  const changes = []
  const skippedNoCompletion = []
  const skippedEndDate = []
  let pinnedCount = 0

  for (const r of rows) {
    const chore = {
      id: r.id,
      frequency: r.frequency,
      dayOfWeek: r.dayOfWeek,
      daysOfWeek: r.daysOfWeek,
      dayOfMonth: r.dayOfMonth,
      endDate: r.endDate ? new Date(r.endDate) : null,
    }
    if (isPinned(chore) || chore.frequency === 'one-off') {
      pinnedCount++
      continue
    }
    const last = lastCompletionStmt.get(r.id)
    if (!last) {
      skippedNoCompletion.push(r.title)
      continue
    }
    const completedAt = new Date(last.completedAt)
    const computed = recomputeFloatingNextDueDate(chore, completedAt, r.tz)
    if (computed === null) {
      skippedEndDate.push(r.title)
      continue
    }
    const newVal = toDbFormat(computed)
    if (newVal !== r.nextDueDate) {
      changes.push({
        id: r.id,
        title: r.title,
        freq: r.frequency,
        completedAt: last.completedAt,
        from: r.nextDueDate,
        to: newVal,
      })
    }
  }

  const localDay = (iso, tz) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) : 'null')
  const tz = rows[0]?.tz ?? 'Australia/Sydney'

  console.log(`\nFloating triggerOnComplete chores needing repair: ${changes.length}`)
  console.log(`(pinned/one-off skipped: ${pinnedCount}; no completion: ${skippedNoCompletion.length}; endDate skipped: ${skippedEndDate.length})\n`)
  for (const c of changes) {
    console.log(
      `  ${c.title} [${c.freq}] last done ${localDay(c.completedAt, tz)}` +
        `  ${localDay(c.from, tz)} -> ${localDay(c.to, tz)}`
    )
  }
  if (skippedEndDate.length) console.log(`\n  endDate-bounded (review manually): ${skippedEndDate.join(', ')}`)

  if (!apply) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.')
  } else {
    const tx = db.transaction((items) => {
      for (const it of items) updateStmt.run(it.to, it.id)
    })
    tx(changes.map((c) => ({ id: c.id, to: c.to })))
    console.log(`\nAPPLIED — ${changes.length} rows updated.`)
  }
  db.close()
}
