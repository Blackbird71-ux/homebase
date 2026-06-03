import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Build-time guard against the two UTC date anti-patterns that are the #1 source of
// date bugs in this codebase (see AGENTS.md §Timezone and CHECKLIST.md). Both are
// currently absent from production source; this test fails the build if either
// reappears, so the missing/duplicate-event class of bug cannot silently return.
//
// It does NOT ban `date-fns` wholesale: several server files legitimately use its
// timezone-neutral arithmetic (addDays/addMonths/parseISO). The dangerous usages
// (`format`, `startOf*` in server code) are a separate, pre-existing cleanup and are
// intentionally out of scope here — codifying them as allowed exceptions would
// rubber-stamp real debt.

const SRC_ROOT = join(process.cwd(), 'src')

// 1. UTC midnight used as a day boundary: `new Date('YYYY-MM-DDT00:00:00Z')`.
//    Wrong for users east of UTC — see AGENTS.md §Timezone failure modes.
const UTC_MIDNIGHT_BOUNDARY = /new Date\(\s*['"`]\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z['"`]\s*\)/

// 2. Bucketing a calendar event off its raw end: `startOfDay(new Date(<...>.end))`.
//    Synthetic all-day events end at T23:59:59Z, which floors to the next local day
//    east of UTC (spillover). Use eventFallsOnDay(event, day, timezone) instead.
const STARTOFDAY_ON_END = /startOfDay\(\s*new Date\([^)]*\.end\b/

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      collectSourceFiles(full, out)
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      out.push(full)
    }
  }
  return out
}

function scan(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${file}:${i + 1}  ${line.trim()}`)
    })
  }
  return hits
}

describe('UTC date anti-pattern guard (AGENTS.md §Timezone)', () => {
  it('no `new Date(\'YYYY-MM-DDT00:00:00Z\')` day boundaries in production source', () => {
    const hits = scan(UTC_MIDNIGHT_BOUNDARY)
    expect(hits, `Use todayBoundsInTz(timezone) for day boundaries, not UTC midnight:\n${hits.join('\n')}`).toEqual([])
  })

  it('no `startOfDay(new Date(<event>.end))` calendar bucketing in production source', () => {
    const hits = scan(STARTOFDAY_ON_END)
    expect(hits, `Use eventFallsOnDay(event, day, timezone) to bucket events:\n${hits.join('\n')}`).toEqual([])
  })
})
