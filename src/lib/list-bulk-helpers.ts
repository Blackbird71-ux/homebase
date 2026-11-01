import type { ListItemShape } from '@/lib/list-helpers'

/** Client-safe. A single change applied to many list items at once. */
export type BulkChange =
  | { type: 'category'; category: string | null }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'delete' }

export const BULK_MAX_IDS = 500

export function parseBulkChange(raw: unknown): BulkChange | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  switch (c.type) {
    case 'lock':
    case 'unlock':
    case 'delete':
      return { type: c.type }
    case 'category': {
      if (c.category === null) return { type: 'category', category: null }
      if (typeof c.category !== 'string') return null
      const name = c.category.trim()
      return name && name.length <= 100 ? { type: 'category', category: name } : null
    }
    default:
      return null
  }
}

/** Mirrors the server rules so optimistic state and the DB agree: locked items can't be deleted. */
export function applyBulkChange(items: ListItemShape[], ids: string[], change: BulkChange): ListItemShape[] {
  const target = new Set(ids)
  switch (change.type) {
    case 'category':
      return items.map((i) => (target.has(i.id) ? { ...i, category: change.category } : i))
    case 'lock':
      return items.map((i) => (target.has(i.id) ? { ...i, isLocked: true } : i))
    case 'unlock':
      return items.map((i) => (target.has(i.id) ? { ...i, isLocked: false } : i))
    case 'delete':
      return items.filter((i) => !(target.has(i.id) && !i.isLocked))
  }
}

export const PASTE_MAX_ITEMS = 200

export interface PastedItem {
  content: string
  /** Section heading the line sat under ("Other" / "No category" = null); undefined = no heading, use the dialog's category. */
  heading: string | null | undefined
}

const NO_CATEGORY_HEADINGS = new Set(['other', 'no category', 'uncategorised', 'uncategorized'])

/**
 * Turns pasted text into items: one per line, bullets / tick-box markers / numbering stripped,
 * blanks and repeats dropped. A plain line ending in ":" starts a section; the lines under it
 * carry that heading so they can be filed into the matching category.
 */
export function parsePastedItems(text: string): PastedItem[] {
  const seen = new Set<string>()
  const out: PastedItem[] = []
  let heading: string | null | undefined = undefined
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const bullet = /^(?:[-*•·▪◦]|\[[ xX]?\]|\d+[.)])\s+/.test(trimmed)
    if (!bullet && trimmed.length > 1 && trimmed.endsWith(':')) {
      const name = trimmed.slice(0, -1).trim().slice(0, 100)
      if (name) {
        heading = NO_CATEGORY_HEADINGS.has(name.toLowerCase()) ? null : name
        continue
      }
    }
    const line = trimmed
      .replace(/^(?:[-*•·▪◦]|\[[ xX]?\]|\d+[.)])\s+/, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .trim()
    if (!line) continue
    const content = line.slice(0, 500)
    const key = `${heading ?? ''}|${content.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ content, heading })
  }
  return out.slice(0, PASTE_MAX_ITEMS)
}
