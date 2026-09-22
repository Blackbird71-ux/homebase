import { prisma } from '@/lib/prisma'
import type { StickyNoteData, StickyNoteScope, StickyNotes } from '@/types'

/** Max characters stored in one sticky note. */
export const STICKY_NOTE_MAX_LENGTH = 10_000

const SHARED_KEY = 'shared'

/** Placeholder when the sticky-note card is hidden and its data isn't loaded. */
export const EMPTY_STICKY_NOTES: StickyNotes = {
  shared: { content: '', updatedAt: null },
  personal: { content: '', updatedAt: null },
}

/** The StickyNote.ownerKey for a scope: 'shared' for the family note, the user's id for a personal note. */
function ownerKeyFor(scope: StickyNoteScope, userId: string): string {
  return scope === 'shared' ? SHARED_KEY : userId
}

function toData(row: { content: string; updatedAt: Date } | undefined): StickyNoteData {
  return { content: row?.content ?? '', updatedAt: row?.updatedAt.toISOString() ?? null }
}

/**
 * The family's shared sticky note and the requesting user's personal one.
 * Another user's personal note is never returned (scoped by ownerKey = userId).
 *
 * Server-only (imports prisma). Both the SSR home page and /api/dashboard call
 * this so the card can't diverge between first paint and client refresh.
 */
export async function getStickyNotes(familyId: string, userId: string): Promise<StickyNotes> {
  const rows = await prisma.stickyNote.findMany({
    where: { familyId, ownerKey: { in: [SHARED_KEY, userId] } },
    select: { ownerKey: true, content: true, updatedAt: true },
  })
  return {
    shared: toData(rows.find((r) => r.ownerKey === SHARED_KEY)),
    personal: toData(rows.find((r) => r.ownerKey === userId)),
  }
}

/** Create or overwrite the shared or personal sticky note (last write wins). */
export async function saveStickyNote(
  familyId: string,
  userId: string,
  scope: StickyNoteScope,
  content: string
): Promise<StickyNoteData> {
  const ownerKey = ownerKeyFor(scope, userId)
  const row = await prisma.stickyNote.upsert({
    where: { familyId_ownerKey: { familyId, ownerKey } },
    create: { familyId, ownerKey, content, updatedById: userId },
    update: { content, updatedById: userId },
    select: { content: true, updatedAt: true },
  })
  return toData(row)
}
