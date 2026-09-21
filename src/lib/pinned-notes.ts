import { prisma } from '@/lib/prisma'
import type { PinnedNoteSummary } from '@/types'

/** How many pinned notes the dashboard Notes card shows. */
export const PINNED_NOTES_LIMIT = 6

/**
 * Pinned notes for the dashboard Notes card.
 *
 * Applies the same visibility rules as the notes list: archived notes are
 * excluded, and another user's private notes are never returned. PIN-secured
 * notes are listed by title only — their content is blanked server-side so
 * locked text never reaches the client.
 *
 * Server-only (imports prisma). Both the SSR home page and /api/dashboard call
 * this so the card can't diverge between first paint and client refresh.
 */
export async function getPinnedNotes(
  familyId: string,
  userId: string
): Promise<PinnedNoteSummary[]> {
  const notes = await prisma.note.findMany({
    where: {
      familyId,
      isPinned: true,
      isArchived: false,
      // Never return other users' private notes
      OR: [
        { isPrivate: false },
        { isPrivate: true, createdBy: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: PINNED_NOTES_LIMIT,
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      isPrivate: true,
      pinHash: true,
      updatedAt: true,
    },
  })

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.pinHash ? '' : note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isSecured: !!note.pinHash,
    updatedAt: note.updatedAt.toISOString(),
  }))
}
