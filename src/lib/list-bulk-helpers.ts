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

/** Turns pasted text into item names: one per line, bullets / tick-box markers / numbering stripped, blanks and repeats dropped. */
export function parsePastedItems(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^(?:[-*•·▪◦]|\[[ xX]?\]|\d+[.)])\s+/, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .trim()
    if (!line) continue
    const content = line.slice(0, 500)
    const key = content.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(content)
  }
  return out.slice(0, PASTE_MAX_ITEMS)
}
