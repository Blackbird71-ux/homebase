import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getUnlockCookieName, isUnlockTokenValid } from '@/lib/secure-unlock'
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
      pinHash: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!note) notFound()

  // Check if note is PIN-protected and needs unlocking
  let isLocked = false
  if (note.pinHash) {
    const cookieStore = await cookies()
    const cookieName = getUnlockCookieName('note', id)
    const unlockCookie = cookieStore.get(cookieName)
    isLocked = !(unlockCookie?.value && isUnlockTokenValid(unlockCookie.value))
  }

  // Fetch tag colors for the family
  const tags = await prisma.tag.findMany({
    where: { familyId: user.familyId },
    select: { name: true, color: true },
  })
  const tagColors: Record<string, string> = {}
  for (const tag of tags) {
    if (tag.color) {
      tagColors[tag.name] = tag.color
    }
  }

  const serialized = {
    id: note.id,
    title: note.title,
    content: isLocked ? '' : note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isSecured: !!note.pinHash,
    isLocked,
    pinHash: note.pinHash,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }

  return <NoteDetail note={serialized} tagColors={tagColors} />
}
