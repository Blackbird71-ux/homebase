// ── Forecast parent/child dedup ──────────────────────────────────────────────
//
// A recurring stream (bill or income) is stored as a chain of occurrence rows:
// the parent template plus any spawned child occurrences, linked by a parent id
// (bills → parentBillId, income → parentIncomeId). Both the parent and a spawned
// child can surface in the operational list at once.
//
// In a FORECAST view each row contributes the stream's periodised run-rate, so
// counting both the parent and its child double-counts the stream (e.g. Charity
// $50 → $100/period; Michelle's Salary likewise). This drops any row that is the
// parent of another row present in the SAME set, keeping only the leaf
// occurrence(s) — the child carries the concrete occurrence for the period.
//
// Pass the set you intend to forecast over (e.g. already window-filtered). Do NOT
// use this for cash/actuals views: there each settled occurrence is a real,
// separately-counted cash event.
export function dropSupersededParents<T extends { id: string }>(
  rows: T[],
  parentIdOf: (row: T) => string | null | undefined,
): T[] {
  const supersededIds = new Set<string>()
  for (const r of rows) {
    const pid = parentIdOf(r)
    if (pid) supersededIds.add(pid)
  }
  if (supersededIds.size === 0) return rows
  return rows.filter(r => !supersededIds.has(r.id))
}
