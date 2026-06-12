// Synthetic calendar events (fed by /api/events) carry a hardcoded server-side
// hex in event.color which can never track the active theme. Resolve their
// colour client-side from the sidebar category tokens (--cat-* in
// apple-theme.css :root) so calendar badges match the nav dots on every theme.
// Trips keep their per-trip colour and real user events keep their chosen
// colour (both fall through to event.color); events with no colour fall back
// to the Calendar token.
const SOURCE_COLOR_VARS: Record<string, string> = {
  chore: 'var(--cat-chores)',
  meal: 'var(--cat-mealplan)',
  todo: 'var(--cat-lists)',
  bill: 'var(--cat-finance)',
  income: 'var(--cat-finance)',
  document: 'var(--cat-documents)',
  maintenance: 'var(--cat-maintenance)',
  birthday: 'var(--cat-contacts)',
}

export function eventColor(event: { source?: string | null; color?: string | null; category?: string | null }): string {
  // Expiry-day document events: urgency overrides module identity (like
  // overdue reminders in iOS) — the advance "Expiring:" reminder keeps grey.
  if (event.category === 'document-expired') return 'var(--destructive)'
  if (event.source && SOURCE_COLOR_VARS[event.source]) return SOURCE_COLOR_VARS[event.source]
  return event.color ?? 'var(--cat-calendar)'
}
