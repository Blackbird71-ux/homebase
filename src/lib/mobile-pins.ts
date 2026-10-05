// Per-user pinned shortcuts shown at the top of the mobile + sheet.
// Pure and client-safe (no prisma/server imports) — stored in uiPreferences.mobilePins.

export const MAX_PINS = 6

export type Pin =
  | { type: 'page'; href: string }
  | { type: 'list'; id: string }

export function pinKey(pin: Pin): string {
  return pin.type === 'page' ? `page:${pin.href}` : `list:${pin.id}`
}

export function pinHref(pin: Pin): string {
  return pin.type === 'page' ? pin.href : `/lists?list=${encodeURIComponent(pin.id)}`
}

/**
 * Lenient parse of the stored value: drops malformed or duplicate entries and
 * caps at MAX_PINS, so bad data can never break the sheet.
 */
export function normalizePins(raw: unknown): Pin[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const pins: Pin[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    let pin: Pin | null = null
    if (e.type === 'page' && typeof e.href === 'string' && e.href.startsWith('/')) {
      pin = { type: 'page', href: e.href }
    } else if (e.type === 'list' && typeof e.id === 'string' && e.id) {
      pin = { type: 'list', id: e.id }
    }
    if (!pin || seen.has(pinKey(pin))) continue
    seen.add(pinKey(pin))
    pins.push(pin)
    if (pins.length >= MAX_PINS) break
  }
  return pins
}
