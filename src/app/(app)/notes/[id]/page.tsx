import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { NoteDetail } from './NoteDetail'

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireSession()
  const { id } = await params

  const note = await prisma.note.findFirst({
    where: { id, familyId: user.familyId },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      isPrivate: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!note) notFound()

  const serialized = {
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }

  return <NoteDetail note={serialized} />
}