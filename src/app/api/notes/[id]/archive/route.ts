import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { isArchived } = body

  if (typeof isArchived !== 'boolean') {
    return NextResponse.json(
      { error: 'isArchived (boolean) is required' },
      { status: 400 }
    )
  }

  // Check if note exists and belongs to user's family
  const existingNote = await prisma.note.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!existingNote) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    )
  }

  const note = await prisma.note.update({
    where: { id },
    data: { isArchived },
  })

  void createAuditLog(
    user,
    'update',
    'note',
    id,
    `${isArchived ? 'Archived' : 'Unarchived'} note "${existingNote.title}"`,
    { note: { title: existingNote.title, isArchived } }
  )

  return NextResponse.json({
    id: note.id,
    title: note.title,
    content: note.content,
    category: note.category,
    isPrivate: note.isPrivate,
    isArchived: note.isArchived,
    isSecured: !!note.pinHash,
    tags: note.tags ? JSON.parse(note.tags) as string[] : [],
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  })
}
