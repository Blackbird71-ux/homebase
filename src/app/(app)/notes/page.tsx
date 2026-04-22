import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { NotesClient } from './NotesClient'

function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try {
    return JSON.parse(tags) as string[]
  } catch {
    return []
  }
}

async function getData(familyId: string) {
  const notes = await prisma.note.findMany({
    where: { familyId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Get unique categories for filtering
  const categories = Array.from(new Set(notes.map(note => note.category).filter(Boolean))) as string[]

  return {
    notes: notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      category: note.category,
      tags: (() => {
        if (!note.tags) return []
        try {
          return JSON.parse(note.tags) as string[]
        } catch {
          return []
        }
      })(),
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    categories,
  }
}

export default async function NotesPage() {
  const user = await requireSession()
  const { notes, categories } = await getData(user.familyId)
  return <NotesClient initialNotes={notes} initialCategories={categories} />
}