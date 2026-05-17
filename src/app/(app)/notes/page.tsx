import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { NotesClient } from './NotesClient'

async function getData(familyId: string, userId: string) {
  const notes = await prisma.note.findMany({
    where: {
      familyId,
      // Exclude other users' private notes
      OR: [
        { isPrivate: false },
        { isPrivate: true, createdBy: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      isPrivate: true,
      isArchived: true,
      pinHash: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const categories = Array.from(new Set(notes.map(note => note.category).filter(Boolean))) as string[]

  // Fetch tag colors for note-scoped and general tags only
  const tags = await (prisma as any).tag.findMany({
    where: { familyId, scope: { in: ['general', 'note'] } },
    select: { name: true, color: true },
  })
  const tagColors: Record<string, string> = {}
  for (const tag of tags) {
    if (tag.color) {
      tagColors[tag.name] = tag.color
    }
  }

  return {
    notes: notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      isPrivate: note.isPrivate,
      isArchived: note.isArchived,
      isSecured: !!note.pinHash,
      tags: (() => {
        if (!note.tags) return []
        try { return JSON.parse(note.tags) as string[] } catch { return [] }
      })(),
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    categories,
    tagColors,
  }
}

export default async function NotesPage() {
  const user = await requireSession()
  const { notes, categories, tagColors } = await getData(user.familyId, user.id)
  return (
    <NotesClient
      initialNotes={notes}
      initialCategories={categories}
      currentUserId={user.id}
      tagColors={tagColors}
    />
  )
}
